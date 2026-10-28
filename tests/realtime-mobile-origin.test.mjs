import test from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin } from "../apps/api/src/realtime/server.js";
test("Native application origins can authenticate to HTTPS CRM; arbitrary cross-site origins remain blocked", () => {
  const request = (origin) => ({
    headers: {
      origin,
      host: "crm.example.invalid",
      "x-forwarded-proto": "https",
    },
    socket: {},
  });
  for (const origin of [
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
    "https://crm.example.invalid",
  ])
    assert.equal(allowedOrigin(request(origin)), true);
  for (const origin of [
    "https://evil.example",
    "capacitor://evil.example",
    "null",
    "https://localhost:12345",
  ])
    assert.equal(allowedOrigin(request(origin)), false);
});
