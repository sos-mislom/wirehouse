import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fixture } from "./fixtures.mjs";
import {
  saveSource,
  rotateSourceToken,
  authenticateSource,
  saveExternalLink,
  saveAccount,
  processExchange,
  enqueueExchange,
} from "../apps/api/src/domain/accounting.js";
const source = (f) =>
  saveSource(f.db, f.admin, null, {
    name: "Бухгалтерия",
    environment: "test",
    active: true,
  });
const account = (f, s, leaseId = f.lease.id) =>
  saveAccount(f.db, null, {
    sourceId: s.id,
    externalId: "same-external-id",
    leaseId,
    number: "ЛС-001",
    validFrom: "2026-01-01",
    validTo: null,
    status: "active",
  });
const statement = (version = 1, charged = 100) => ({
  externalId: "statement-1",
  accountExternalId: "same-external-id",
  period: "2026-10",
  opening: 20,
  charged,
  paid: 40,
  closing: 20 + charged - 40,
  lines: [{ service: "Аренда", amount: charged }],
  asOf: "2026-10-18T10:00:00.000Z",
  version,
});
const message = (items, messageId = crypto.randomUUID()) => ({
  messageId,
  environment: "test",
  schemaVersion: 1,
  kind: "statements",
  items,
});
test("Accounting identities are isolated by source, linked explicitly and immutable across leases", () => {
  const f = fixture();
  try {
    const s = source(f),
      t = source(f),
      a = account(f, s),
      b = account(f, t, f.otherLease.id);
    assert.notEqual(a.id, b.id);
    assert.throws(
      () => f.db.updateLease(f.lease.id, { unitId: f.otherUnit.id }),
      /Нельзя менять участника или помещение/,
    );
    assert.equal(f.db.data.external_links.length, 2);
    assert.throws(() => account(f, s), /внешним ID/);
    assert.throws(
      () => saveAccount(f.db, a.id, { ...a, leaseId: f.otherLease.id }),
      /Проверьте поля/,
    ); // DTO refuses storage-only fields.
    assert.throws(
      () =>
        saveExternalLink(f.db, {
          sourceId: s.id,
          entityType: "personal_accounts",
          externalId: "new",
          localId: a.id,
          version: 1,
        }),
      /уже сопоставлена/,
    );
    assert.throws(
      () =>
        saveSource(f.db, f.admin, s.id, {
          name: s.name,
          environment: "production",
          active: true,
          updatedAt: s.updatedAt,
        }),
      /Среду/,
    );
  } finally {
    f.cleanup();
  }
});
test("Exchange persists failures but atomically rolls back a whole package, then retries once without duplicates", () => {
  const f = fixture();
  try {
    const s = source(f);
    account(f, s);
    const packet = message([
      statement(),
      { ...statement(), externalId: "bad", accountExternalId: "unknown" },
    ]);
    const failed = processExchange(f.db, s.id, packet, "test");
    assert.equal(failed.status, "failed");
    assert.equal(f.db.data.account_statements.length, 0);
    assert.equal(f.db.data.exchange_inbox.length, 1);
    assert.match(failed.error, /ЛС/);
    saveAccount(f.db, null, {
      sourceId: s.id,
      externalId: "unknown",
      leaseId: f.otherLease.id,
      number: "002",
      validFrom: "2026-01-01",
      validTo: null,
      status: "active",
    });
    const applied = processExchange(f.db, s.id, packet, "test");
    assert.equal(applied.status, "applied");
    assert.equal(applied.attempts, 2);
    assert.equal(f.db.data.account_statements.length, 2);
    assert.equal(processExchange(f.db, s.id, packet, "test").duplicate, true);
    assert.throws(
      () =>
        processExchange(
          f.db,
          s.id,
          { ...packet, items: [statement(2)] },
          "test",
        ),
      /другим содержимым/,
    );
  } finally {
    f.cleanup();
  }
});
test("Exchange enforces environment, versions, same-version consistency and accounting balances", () => {
  const f = fixture();
  try {
    const s = source(f);
    account(f, s);
    assert.throws(
      () => processExchange(f.db, s.id, message([statement()]), "production"),
      /другой среды/,
    );
    assert.equal(f.db.data.exchange_inbox.length, 0);
    assert.equal(
      processExchange(f.db, s.id, message([statement(2)]), "test").status,
      "applied",
    );
    assert.equal(
      processExchange(f.db, s.id, message([statement(1)]), "test").result
        .skipped,
      1,
    );
    assert.equal(
      processExchange(f.db, s.id, message([statement(2, 200)]), "test").status,
      "failed",
    );
    assert.equal(f.db.data.account_statements[0].charged, 100);
    assert.equal(
      processExchange(
        f.db,
        s.id,
        message([{ ...statement(3), closing: 999 }]),
        "test",
      ).status,
      "failed",
    );
    assert.equal(f.db.data.account_statements[0].version, 2);
    const p = message([statement(3, 200)]);
    assert.equal(processExchange(f.db, s.id, p, "test").status, "applied");
    const reordered = {
      ...p,
      items: p.items.map((i) =>
        Object.fromEntries(Object.entries(i).reverse()),
      ),
    };
    assert.equal(
      processExchange(f.db, s.id, reordered, "test").duplicate,
      true,
    );
  } finally {
    f.cleanup();
  }
});
test("Source tokens rotate, are never returned in source data, and outbox identities are stable", () => {
  const f = fixture();
  try {
    const s = source(f),
      first = rotateSourceToken(f.db, s.id);
    assert.equal(first.source.tokenHash, undefined);
    assert.equal(authenticateSource(f.db, s.id, first.token).id, s.id);
    const second = rotateSourceToken(f.db, s.id);
    assert.throws(
      () => authenticateSource(f.db, s.id, first.token),
      /авторизован/,
    );
    assert.ok(authenticateSource(f.db, s.id, second.token));
    const a = enqueueExchange(f.db, s.id, "readings", "reading-1", {
      value: 12,
    });
    assert.equal(
      enqueueExchange(f.db, s.id, "readings", "reading-1", { value: 12 }).id,
      a.id,
    );
    assert.throws(
      () => enqueueExchange(f.db, s.id, "readings", "reading-1", { value: 13 }),
      /уже использован/,
    );
  } finally {
    f.cleanup();
  }
});
test("Account imports resolve source-bound contracts and reject stale or conflicting versions", () => {
  const f = fixture();
  try {
    const s = source(f);
    saveExternalLink(f.db, {
      sourceId: s.id,
      entityType: "leases",
      externalId: "contract-1",
      localId: f.lease.id,
      version: 0,
    });
    const item = {
      externalId: "account-1",
      leaseExternalId: "contract-1",
      number: "001",
      validFrom: "2026-01-01",
      validTo: null,
      status: "active",
      version: 1,
    };
    const m = () => ({ ...message([]), kind: "accounts", items: [item] });
    assert.equal(processExchange(f.db, s.id, m(), "test").status, "applied");
    assert.equal(processExchange(f.db, s.id, m(), "test").result.skipped, 1);
    item.number = "changed";
    assert.equal(processExchange(f.db, s.id, m(), "test").status, "failed");
    item.version = 2;
    assert.equal(processExchange(f.db, s.id, m(), "test").status, "applied");
    assert.equal(f.db.data.personal_accounts[0].number, "changed");
  } finally {
    f.cleanup();
  }
});
