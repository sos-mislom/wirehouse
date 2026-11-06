import test from "node:test";
import assert from "node:assert/strict";
import {
  meterRegistrationFixture,
  meterInput,
} from "../meter-registration-helpers.mjs";
import { postgresFixture } from "./helpers.mjs";
import { openDatabase } from "../../apps/api/src/persistence/database.js";
import { readCollectionsFor } from "../../apps/api/src/persistence/read-profiles.js";
import { saveOperation, getOperations } from "../../apps/api/src/operations.js";
import {
  registerDocument,
  removeExistingDocument,
} from "../../apps/api/src/domain/documents.js";
import {
  saveReadingPeriod,
  submitReading,
  reviewReading,
  correctReadingPhoto,
  readingsWorkspace,
} from "../../apps/api/src/domain/readings.js";

const enabled = Boolean(process.env.TEST_POSTGRES_URL);
test(
  "Meter read profiles explicitly include source delivery status without exposing transport payloads",
  { skip: !enabled },
  async (t) => {
    const f = meterRegistrationFixture();
    t.after(f.cleanup);
    const meter = saveOperation(f.db, f.manager, "meters", null, meterInput(f)),
      pg = await postgresFixture(f.db.data);
    let db;
    t.after(async () => {
      await db?.close();
      await pg.cleanup();
    });
    db = await openDatabase({ databaseUrl: pg.url });
    for (const pathname of ["/api/operations", "/api/readings"]) {
      const collections = readCollectionsFor(pathname);
      assert.ok(collections.includes("exchange_outbox"));
      assert.equal(collections.includes("exchange_inbox"), false);
      assert.equal(collections.includes("auth_challenges"), false);
      await db.requestScope(
        { readOnly: true, collections, source: "GET " + pathname },
        () => {
          const data =
              pathname === "/api/operations"
                ? getOperations(db, f.manager)
                : readingsWorkspace(db, f.manager),
            item = data.meters.find((row) => row.id === meter.id);
          assert.equal(item.integrationStatus, "pending");
          assert.equal(item.sourceId, f.source.id);
          assert.equal(
            JSON.stringify(data).includes('"accountExternalId"'),
            false,
          );
        },
      );
    }
    await db.requestScope({}, () => {
      db.data.exchange_outbox[0].status = "applied";
    });
    await db.requestScope(
      { readOnly: true, collections: readCollectionsFor("/api/readings") },
      () => {
        assert.equal(
          readingsWorkspace(db, f.manager).meters[0].integrationStatus,
          "applied",
        );
        assert.equal(
          readingsWorkspace(db, f.manager).accounts[0].sourceId,
          f.source.id,
        );
      },
    );
  },
);

test(
  "Reading photo correction provenance survives the general audit tail and protects archived originals",
  { skip: !enabled },
  async (t) => {
    const f = meterRegistrationFixture();
    t.after(f.cleanup);
    const meter = saveOperation(f.db, f.manager, "meters", null, meterInput(f));
    f.db.data.exchange_outbox[0].status = "applied";
    const tenant = f.db.getTenantPortalUser(f.tenant.id),
      day = new Date().toISOString().slice(0, 10),
      period = saveReadingPeriod(f.db, f.manager, {
        propertyId: f.property.id,
        name: "Текущий месяц",
        startsOn: day.slice(0, 7) + "-01",
        endsOn: day,
        photoRequired: true,
        thresholdPercent: 50,
      }),
      photo = (actor, stored) =>
        registerDocument(
          f.db,
          actor,
          {
            name: stored,
            category: "photo",
            mimeType: "image/jpeg",
            links: [
              { entityType: "meters", entityId: meter.id, phase: "general" },
            ],
          },
          stored,
          100,
        ),
      original = photo(tenant, "original.jpg"),
      submission = submitReading(f.db, tenant, {
        meterId: meter.id,
        periodId: period.id,
        accountId: f.account.id,
        photoDocumentId: original.id,
        value: 120,
      });
    reviewReading(f.db, f.manager, submission.id, {
      updatedAt: submission.updatedAt,
      accepted: true,
      reason: "Исходная проверка",
    });
    const replacement = photo(f.admin, "reference.jpg"),
      corrected = correctReadingPhoto(f.db, f.admin, submission.id, {
        updatedAt: submission.updatedAt,
        photoDocumentId: replacement.id,
        reason: "Справочное фото, не подтверждает принятое значение120",
      });
    for (let i = 0; i < 250; i++)
      f.db.audit(f.admin, "unrelated_recent_event", "meters", meter.id, {
        index: i,
      });
    const pg = await postgresFixture(f.db.data);
    let db;
    t.after(async () => {
      await db?.close();
      await pg.cleanup();
    });
    db = await openDatabase({ databaseUrl: pg.url });
    await db.requestScope(
      { readOnly: true, collections: readCollectionsFor("/api/readings") },
      () => {
        const item = readingsWorkspace(db, tenant).submissions.find(
          (row) => row.id === submission.id,
        );
        assert.deepEqual(item.photoCorrections, corrected.photoCorrections);
        assert.equal(item.value, 120);
        assert.equal(item.status, "accepted");
        assert.equal(item.photoDocumentId, replacement.id);
        assert.equal(
          db.data.audit_log.filter(
            (event) => event.action === "reading_photo_corrected",
          ).length,
          1,
        );
        assert.equal(getOperations(db, f.admin).audit.length, 200);
        assert.ok(
          getOperations(db, f.admin).audit.every(
            (event) => event.action === "unrelated_recent_event",
          ),
        );
        assert.ok(db.getById("entity_documents", original.id));
      },
    );
    await assert.rejects(
      db.requestScope({}, () => removeExistingDocument(db, original.id)),
      /используется/,
    );
    const state = await pg.readState();
    assert.ok(state.entity_documents.some((row) => row.id === original.id));
    assert.equal(
      state.exchange_outbox.filter((row) => row.kind === "readings")[0].payload
        .photoDocumentId,
      original.id,
    );
    assert.equal(state.exchange_outbox.length, 2);
  },
);
