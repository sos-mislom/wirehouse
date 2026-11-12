import { isMobileApp } from "../mobile-product";

// Offline queue for a worker's commands in the mobile app. When the server
// cannot be reached, a supported command is saved on the phone and sent in
// order once the connection returns, with its original Idempotency-Key so a
// command that did reach the server is never applied twice. Only commands
// whose follow-up does not need the server's answer are queued; everything
// else still fails with a network error.

export type OutboxEntry = {
  seq?: number;
  owner: string;
  method: string;
  path: string;
  body: unknown;
  key: string;
  createdAt: number;
  status: "pending" | "failed";
  error?: string;
  ticketNumber?: string;
};

export const QUEUED_MESSAGE =
  "Нет связи с сервером. Действие сохранено на телефоне и отправится автоматически, когда связь вернётся.";

const queueable: [string, RegExp][] = [
  ["POST", /^\/api\/tickets\/[^/]+\/comments$/],
  ["POST", /^\/api\/tickets\/[^/]+\/attachments$/],
  ["PUT", /^\/api\/tickets\/[^/]+\/checklist\/[^/]+$/],
  ["POST", /^\/api\/tickets\/[^/]+\/workflow\/decision$/],
  ["POST", /^\/api\/documents$/],
];

export function isQueueable(method: string, path: string, body: unknown) {
  if (!isMobileApp || typeof indexedDB === "undefined") return false;
  if (!queueable.some(([m, pattern]) => m === method && pattern.test(path)))
    return false;
  // Meter photos are uploaded to get an id for the reading; only work photos
  // linked to tickets can wait.
  if (path === "/api/documents") {
    const links = (body as { links?: { entityType?: string }[] })?.links;
    return (
      Array.isArray(links) &&
      links.length > 0 &&
      links.every((link) => link.entityType === "tickets")
    );
  }
  return true;
}

// The account the session token belongs to (JWT subject), so a queue survives
// a renewed session of the same person but is never sent as someone else.
export function tokenOwner(token: string) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const subject = JSON.parse(atob(payload)).sub;
    if (typeof subject === "string" && subject) return subject;
  } catch {
    // Fall through to an opaque owner.
  }
  return `token:${token.length}:${token.slice(-16)}`;
}

const databaseName = "wirehouse-outbox";
const storeName = "commands";
// Server receipts last 24 hours. Never replay an ambiguous command after its
// receipt could have expired; the worker must check the task before acting again.
const automaticReplayForMs = 23 * 60 * 60 * 1000;
let database: Promise<IDBDatabase> | undefined;
let entries: OutboxEntry[] = [];
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();
const sentListeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(storeName, {
        keyPath: "seq",
        autoIncrement: true,
      });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

function write<T>(use: (store: IDBObjectStore) => IDBRequest<T> | void) {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const request = use(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

function load() {
  loaded ??= open()
    .then(
      (db) =>
        new Promise<OutboxEntry[]>((resolve, reject) => {
          const request = db
            .transaction(storeName)
            .objectStore(storeName)
            .getAll();
          request.onsuccess = () => resolve(request.result as OutboxEntry[]);
          request.onerror = () => reject(request.error);
        }),
    )
    .then((saved) => {
      entries = saved.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      emit();
    })
    .catch(() => undefined);
  return loaded;
}

export const outboxStatus = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (isMobileApp && typeof indexedDB !== "undefined") void load();
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => entries,
};

export function onOutboxSent(listener: () => void) {
  sentListeners.add(listener);
  return () => {
    sentListeners.delete(listener);
  };
}

export async function hasPendingCommands(token: string | undefined) {
  if (!token || !isMobileApp || typeof indexedDB === "undefined") return false;
  await load();
  const owner = tokenOwner(token);
  return entries.some((e) => e.owner === owner && e.status === "pending");
}

export async function enqueueCommand(
  command: Omit<OutboxEntry, "seq" | "owner" | "createdAt" | "status"> & {
    token: string;
  },
) {
  await load();
  const owner = tokenOwner(command.token);
  const body = JSON.stringify(command.body);
  // A repeated tap on the same action while offline is queued once.
  if (
    entries.some(
      (e) =>
        e.owner === owner &&
        e.status === "pending" &&
        e.method === command.method &&
        e.path === command.path &&
        JSON.stringify(e.body) === body,
    )
  )
    return;
  const entry: OutboxEntry = {
    owner,
    method: command.method,
    path: command.path,
    body: command.body,
    key: command.key,
    createdAt: Date.now(),
    status: "pending",
  };
  entry.seq = Number(await write((store) => store.add(entry)));
  entries = [...entries, entry];
  emit();
}

export async function dismissCommand(seq: number) {
  await write((store) => {
    store.delete(seq);
  });
  entries = entries.filter((e) => e.seq !== seq);
  emit();
}

export async function discardCommands(token: string) {
  await load();
  const owner = tokenOwner(token);
  const mine = entries.filter((e) => e.owner === owner);
  await write((store) => {
    for (const e of mine) if (e.seq !== undefined) store.delete(e.seq);
  });
  entries = entries.filter((e) => e.owner !== owner);
  emit();
}

const nextPending = (owner: string, afterSeq: number) =>
  entries.find(
    (e) => e.owner === owner && e.status === "pending" && e.seq! > afterSeq,
  );

type Send = (
  entry: OutboxEntry,
  body: unknown,
) => Promise<{ item?: { updatedAt?: string } } | undefined>;

let flushing: Promise<void> | undefined;

// Sends the signed-in person's pending commands in order. Stops at the first
// command that cannot reach the server; a command the server rejects (task
// reassigned, already closed) is marked failed with the reason and skipped.
export function flushOutbox(token: string, send: Send) {
  if (!isMobileApp || typeof indexedDB === "undefined")
    return Promise.resolve();
  flushing ??= (async () => {
    await load();
    const owner = tokenOwner(token);
    // Decisions queued one after another carry the task version seen offline;
    // once our own earlier decision moved it, later ones follow that version.
    const versions = new Map<string, { from: string; to: string }>();
    let sent = 0;
    // Offline, the order of taps may not satisfy the server's rules (work
    // started before the required "before" photo was taken). A rejected
    // command is retried once after the commands queued behind it went out.
    const rejected: {
      entry: OutboxEntry;
      error: unknown;
      sentBefore: number;
    }[] = [];
    const attempt = async (entry: OutboxEntry) => {
      const decision = entry.path.match(
        /^\/api\/tickets\/([^/]+)\/workflow\/decision$/,
      );
      const queuedVersion = decision
        ? (entry.body as { updatedAt?: string }).updatedAt
        : undefined;
      const moved = decision ? versions.get(decision[1]) : undefined;
      const body =
        moved && moved.from === queuedVersion
          ? { ...(entry.body as object), updatedAt: moved.to }
          : entry.body;
      if (body !== entry.body) {
        // A lost response must retry the exact same body, including after the
        // app restarts. Persist the advanced version before sending its key.
        await write((store) => store.put({ ...entry, body }));
        entry.body = body;
      }
      try {
        const result = await send(entry, body);
        await dismissCommand(entry.seq!);
        sent++;
        if (decision && queuedVersion && result?.item?.updatedAt)
          versions.set(decision[1], {
            from: queuedVersion,
            to: result.item.updatedAt,
          });
        return "sent" as const;
      } catch (error) {
        const { status = 0, code = "" } = error as {
          status?: number;
          code?: string;
        };
        // No answer, expired session or server trouble: try again later.
        if (
          !status ||
          code === "QUEUED_OFFLINE" ||
          status === 401 ||
          status === 408 ||
          status === 429 ||
          status >= 500
        )
          return "stop" as const;
        return error;
      }
    };
    const markFailed = async (entry: OutboxEntry, error: unknown) => {
      const failed: OutboxEntry = {
        ...entry,
        status: "failed",
        error: error instanceof Error ? error.message : "Ошибка отправки",
      };
      await write((store) => store.put(failed));
      entries = entries.map((e) => (e.seq === entry.seq ? failed : e));
      emit();
    };
    let lastSeq = -1;
    let stopped = false;
    // Re-read the list each time: commands queued during sending go last.
    for (
      let entry = nextPending(owner, lastSeq);
      entry;
      entry = nextPending(owner, lastSeq)
    ) {
      lastSeq = entry.seq!;
      if (
        !Number.isFinite(entry.createdAt) ||
        Date.now() - entry.createdAt >= automaticReplayForMs
      ) {
        await markFailed(
          entry,
          new Error(
            "Срок автоматической отправки истёк. Проверьте задание перед повтором действия.",
          ),
        );
        continue;
      }
      const outcome = await attempt(entry);
      if (outcome === "stop") {
        stopped = true;
        break;
      }
      if (outcome !== "sent")
        rejected.push({ entry, error: outcome, sentBefore: sent });
    }
    for (const { entry, error, sentBefore } of rejected) {
      const retry =
        !stopped && sent > sentBefore ? await attempt(entry) : error;
      if (retry === "stop") break;
      if (retry !== "sent") await markFailed(entry, retry);
    }
    if (sent) sentListeners.forEach((listener) => listener());
  })().finally(() => {
    flushing = undefined;
  });
  return flushing;
}

// Keeps the task number for display once known: a task taken away from the
// worker disappears from their list, but its failed command must stay readable.
export function rememberTicketNumber(seq: number, ticketNumber: string) {
  const entry = entries.find((e) => e.seq === seq);
  if (!entry || entry.ticketNumber === ticketNumber) return;
  const updated = { ...entry, ticketNumber };
  entries = entries.map((e) => (e.seq === seq ? updated : e));
  void write((store) => store.put(updated)).catch(() => undefined);
}
