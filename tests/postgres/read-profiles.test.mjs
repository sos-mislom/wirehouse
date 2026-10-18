import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures.mjs";
import { postgresFixture } from "./helpers.mjs";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { readCollectionsFor } from "../../apps/api/src/persistence/read-profiles.js";
import { saveSource } from "../../apps/api/src/domain/accounting.js";
import { exchangePageQuery } from "../../packages/contracts/src/registry.ts";

const enabled = Boolean(process.env.TEST_POSTGRES_URL);
test(
  "Focused read models load only declared tables, fail on missing dependencies, and cannot become partial write models",
  { skip: !enabled },
  async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const pg = await postgresFixture(f.db.data);
    let db;
    t.after(async () => {
      await db?.close();
      await pg.cleanup();
    });
    db = await openDatabase({ databaseUrl: pg.url });
    const lock = await pg.pool.connect();
    await lock.query(
      "BEGIN; LOCK TABLE warehouse.exchange_inbox,warehouse.auth_challenges IN ACCESS EXCLUSIVE MODE",
    );
    try {
      await db.requestScope(
        {
          readOnly: true,
          collections: readCollectionsFor("/api/auth/me"),
          source: "GET /api/auth/me",
        },
        () => {
          assert.deepEqual(Object.keys(db.data), ["users"]);
          assert.equal(db.getUserById(f.admin.id).is_active, 1);
          assert.throws(() => db.data.exchange_inbox, {
            code: "UNLOADED_COLLECTION",
          });
        },
      );
      await db.requestScope({ readOnly: true, collections: [] }, () =>
        assert.deepEqual(Object.keys(db.data), []),
      );
    } finally {
      await lock.query("ROLLBACK");
      lock.release();
    }
    await assert.rejects(
      db.requestScope({ readOnly: true, collections: ["users"] }, () => {
        db.data.users[0].full_name = "changed";
      }),
      /Read-only request/,
    );
    await assert.rejects(
      db.requestScope({ collections: ["users"] }, () => {}),
      /Partial write models/,
    );
    await db.requestScope({ readOnly: true, collections: ["users"] }, () =>
      assert.equal(db.getUserById(f.admin.id).full_name, f.admin.full_name),
    );
  },
);

test(
  "Exchange pages search all history, have stable ordering and exact filters, and never read payloads",
  { skip: !enabled },
  async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const source = saveSource(f.db, f.admin, null, {
      name: "Источник Север",
      environment: "test",
      active: true,
    });
    for (const direction of ["inbox", "outbox"])
      for (let i = 0; i < (direction === "inbox" ? 130 : 30); i++) {
        f.db.data["exchange_" + direction].push({
          id: "same-" + i,
          sourceId: source.id,
          messageId:
            i === 0
              ? "literal%_message"
              : direction + "-" + String(i).padStart(3, "0"),
          kind: "accounts",
          payloadHash: "private-hash",
          payload: { secret: "private-payload" },
          status: i % 2 ? "failed" : "applied",
          attempts: 1,
          error: i % 2 ? "Ошибка импорта" : null,
          result: null,
          correlationId: null,
          createdAt: "2026-10-18T00:00:00.000Z",
          updatedAt: "2026-10-18T00:00:00.000Z",
          nextAttemptAt: null,
        });
      }
    const pg = await postgresFixture(f.db.data);
    let db;
    t.after(async () => {
      await db?.close();
      await pg.cleanup();
    });
    db = await openDatabase({ databaseUrl: pg.url });
    const page = (query) =>
      db.requestScope({ readOnly: true, collections: ["users"] }, () =>
        db.exchangePage(exchangePageQuery.parse(query)),
      );
    const first = await page({ limit: 25 }),
      second = await page({ limit: 25, offset: 25 });
    assert.equal(first.total, 160);
    assert.equal(first.items.length, 25);
    assert.equal(
      new Set(
        [...first.items, ...second.items].map((r) => r.direction + ":" + r.id),
      ).size,
      50,
    );
    assert.deepEqual(await page({ limit: 25 }), first);
    const last = await page({ direction: "inbox", offset: 125, limit: 25 });
    assert.equal(last.total, 130);
    assert.equal(last.items.length, 5);
    assert.ok(
      last.items.some((r) => r.messageId === "literal%_message"),
      "Records beyond the previous last-100 cutoff remain searchable",
    );
    assert.equal((await page({ q: "literal%_" })).total, 2);
    assert.equal(
      (await page({ q: "%" })).total,
      2,
      "Search uses literal text, not SQL wildcard expansion",
    );
    assert.equal((await page({ q: "' OR 1=1 --" })).total, 0);
    const failed = await page({
      direction: "outbox",
      status: "failed",
      sourceId: source.id,
      limit: 100,
    });
    assert.equal(failed.total, 15);
    assert.ok(
      failed.items.every(
        (r) => r.direction === "outbox" && r.status === "failed",
      ),
    );
    assert.equal((await page({ q: "север", limit: 100 })).total, 160);
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes("private-"), false);
    assert.ok(
      first.items.every(
        (r) => !Object.hasOwn(r, "payload") && !Object.hasOwn(r, "payloadHash"),
      ),
    );
    assert.deepEqual((await page({ offset: 99999 })).items, []);
    const client = await pg.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const original = client.query.bind(client);
      let projection = "";
      client.query = (sql, ...rest) => {
        projection += sql;
        return original(sql, ...rest);
      };
      const { exchangePage } =
        await import("../../apps/api/src/persistence/exchange-page.js");
      await exchangePage(client, exchangePageQuery.parse({}));
      assert.equal(
        /payload|payload_hash/.test(projection),
        false,
        "Queries do not fetch JSONB transport payloads",
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  },
);
