import crypto from "node:crypto";
import fs from "node:fs";
import http2 from "node:http2";

// Push notifications to the mobile app: Firebase Cloud Messaging HTTP v1 for
// Android and APNs (HTTP/2, token authentication) for iOS. Both are optional:
// without credentials the platform is simply skipped. Credentials belong to the
// customer's Firebase project and Apple developer account.

const base64url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const readSecret = (inline, file) =>
  inline || (file ? fs.readFileSync(file, "utf8") : "");

export function readPushConfig(env = process.env) {
  const serviceAccount = readSecret(
    env.FCM_SERVICE_ACCOUNT_JSON,
    env.FCM_SERVICE_ACCOUNT_FILE,
  );
  const fcm = serviceAccount ? JSON.parse(serviceAccount) : null;
  if (fcm && (!fcm.project_id || !fcm.client_email || !fcm.private_key))
    throw new Error(
      "FCM service account must contain project_id, client_email and private_key",
    );
  const apnsKey = readSecret(env.APNS_PRIVATE_KEY, env.APNS_PRIVATE_KEY_FILE);
  const apns =
    apnsKey || env.APNS_KEY_ID || env.APNS_TEAM_ID
      ? {
          key: apnsKey,
          keyId: env.APNS_KEY_ID ?? "",
          teamId: env.APNS_TEAM_ID ?? "",
          topic: env.APNS_BUNDLE_ID || "ru.skladkontur.app",
          origin:
            env.APNS_ORIGIN ||
            (env.APNS_ENVIRONMENT === "sandbox"
              ? "https://api.sandbox.push.apple.com"
              : "https://api.push.apple.com"),
        }
      : null;
  if (apns && (!apns.key || !apns.keyId || !apns.teamId))
    throw new Error(
      "APNs requires APNS_PRIVATE_KEY (or _FILE), APNS_KEY_ID and APNS_TEAM_ID",
    );
  return {
    fcm: fcm && {
      projectId: fcm.project_id,
      clientEmail: fcm.client_email,
      privateKey: fcm.private_key,
      tokenUri: fcm.token_uri || "https://oauth2.googleapis.com/token",
      origin: env.FCM_API_ORIGIN || "https://fcm.googleapis.com",
    },
    apns,
  };
}

export function createPushService({
  config,
  listDevices,
  deleteDevices,
  fetch = globalThis.fetch,
  log = console,
}) {
  let fcmAccess = { token: "", expires: 0 };
  let apnsJwt = { token: "", issued: 0 };
  let apnsSession;

  async function fcmToken() {
    if (fcmAccess.expires > Date.now() + 60_000) return fcmAccess.token;
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
      iss: config.fcm.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: config.fcm.tokenUri,
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(unsigned), config.fcm.privateKey)
      .toString("base64url");
    const response = await fetch(config.fcm.tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    if (!response.ok || !body.access_token)
      throw new Error(`FCM authorization failed (${response.status})`);
    fcmAccess = {
      token: body.access_token,
      expires: Date.now() + Number(body.expires_in ?? 3600) * 1000,
    };
    return fcmAccess.token;
  }

  // Returns true when the device token is permanently invalid.
  async function sendFcm(token, message) {
    const response = await fetch(
      `${config.fcm.origin}/v1/projects/${config.fcm.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await fcmToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: "high" },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.ok) return false;
    const body = await response.json().catch(() => ({}));
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode;
    if (code === "UNREGISTERED" || code === "INVALID_ARGUMENT") return true;
    throw new Error(`FCM send failed (${response.status} ${code ?? ""})`);
  }

  function apnsToken() {
    // Apple accepts a provider token for up to an hour and rejects refreshes
    // more often than every 20 minutes.
    if (Date.now() - apnsJwt.issued < 40 * 60_000) return apnsJwt.token;
    const unsigned = `${base64url({ alg: "ES256", kid: config.apns.keyId })}.${base64url(
      { iss: config.apns.teamId, iat: Math.floor(Date.now() / 1000) },
    )}`;
    const signature = crypto
      .sign("sha256", Buffer.from(unsigned), {
        key: config.apns.key,
        dsaEncoding: "ieee-p1363",
      })
      .toString("base64url");
    apnsJwt = { token: `${unsigned}.${signature}`, issued: Date.now() };
    return apnsJwt.token;
  }

  function apnsConnection() {
    if (!apnsSession || apnsSession.closed || apnsSession.destroyed) {
      apnsSession = http2.connect(config.apns.origin);
      apnsSession.on("error", () => apnsSession?.destroy());
      apnsSession.unref();
    }
    return apnsSession;
  }

  function sendApns(token, message) {
    return new Promise((resolve, reject) => {
      const request = apnsConnection().request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${apnsToken()}`,
        "apns-topic": config.apns.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      request.setTimeout(10_000, () =>
        request.close(http2.constants.NGHTTP2_CANCEL),
      );
      let status = 0;
      let body = "";
      request.on("response", (headers) => (status = headers[":status"]));
      request.setEncoding("utf8");
      request.on("data", (chunk) => (body += chunk));
      request.on("error", reject);
      request.on("end", () => {
        if (status === 200) return resolve(false);
        const reason = (() => {
          try {
            return JSON.parse(body).reason;
          } catch {
            return "";
          }
        })();
        if (
          status === 410 ||
          ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(
            reason,
          )
        )
          return resolve(true);
        if (status === 0)
          return reject(new Error("APNs request was cancelled"));
        reject(new Error(`APNs send failed (${status} ${reason})`));
      });
      request.end(
        JSON.stringify({
          aps: {
            alert: { title: message.title, body: message.body },
            sound: "default",
          },
          ...message.data,
        }),
      );
    });
  }

  const enabled = Boolean(config.fcm || config.apns);

  // Delivers one notification to every registered device of the recipients.
  // Failures are logged and never affect the business operation.
  async function send({ userIds, title, body, data = {} }) {
    if (!enabled || !userIds.length) return { sent: 0, removed: 0 };
    const devices = await listDevices(userIds);
    const message = {
      title: String(title).slice(0, 200),
      body: String(body ?? "").slice(0, 1000),
      // FCM data values must be strings.
      data: Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
    };
    const invalid = [];
    let sent = 0;
    await Promise.all(
      devices.map(async (device) => {
        const sender =
          device.platform === "android" && config.fcm
            ? sendFcm
            : device.platform === "ios" && config.apns
              ? sendApns
              : null;
        if (!sender) return;
        try {
          if (await sender(device.token, message)) invalid.push(device.token);
          else sent++;
        } catch (error) {
          log.error("Push delivery failed", {
            platform: device.platform,
            message: error.message,
          });
        }
      }),
    );
    if (invalid.length) await deleteDevices(invalid);
    return { sent, removed: invalid.length };
  }

  return {
    enabled,
    send,
    close: () => apnsSession?.close(),
  };
}
