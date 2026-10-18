import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  saveAssignment,
  revokeAssignment,
  contextCan,
} from "../apps/api/src/domain/context-access.js";
import {
  saveSource,
  saveAccount,
  saveExternalLink,
} from "../apps/api/src/domain/accounting.js";
import {
  registerDocument,
  listDocuments,
} from "../apps/api/src/domain/documents.js";
import {
  workflowFor,
  saveTerms,
  decideTicket,
} from "../apps/api/src/domain/ticket-workflow.js";
import {
  saveReadingPeriod,
  submitReading,
  reviewReading,
} from "../apps/api/src/domain/readings.js";
import { saveOperation, runMaintenance } from "../apps/api/src/operations.js";
import {
  changeMaintenanceTask,
  maintenanceProgress,
} from "../apps/api/src/domain/maintenance-progress.js";
const today = () => new Date().toISOString().slice(0, 10);
const acc = (f) => {
  const source = saveSource(f.db, f.admin, null, {
    name: "Тест",
    environment: "test",
    active: true,
  });
  const account = saveAccount(f.db, null, {
    sourceId: source.id,
    leaseId: f.lease.id,
    externalId: "account-1",
    number: "001",
    status: "active",
    validFrom: f.lease.start_date,
    validTo: null,
  });
  return { source, account };
};
const portal = (f) => f.db.getTenantPortalUser(f.tenant.id);
const ticket = (f) =>
  f.db.createTicket({
    unitId: f.unit.id,
    tenantId: f.tenant.id,
    leaseId: f.lease.id,
    createdBy: portal(f).id,
    assignedTo: f.worker.id,
    category: "electrical",
    priority: "medium",
    title: "Ремонт",
    description: "Не работает",
  });
const photo = (f, actor, type, id, phase = "general") =>
  registerDocument(
    f.db,
    actor,
    {
      name: "Фото",
      category: "photo",
      mimeType: "image/jpeg",
      links: [{ entityType: type, entityId: id, phase }],
    },
    "photo.jpg",
    10,
  );
const act = (f, actor, id, action, reason = "") =>
  f.db.transaction(() =>
    decideTicket(f.db, actor, id, {
      updatedAt: workflowFor(f.db, id).updatedAt,
      action,
      reason,
    }),
  );
test("Context grants separate property visibility from finance, multiple accounts, expiry and immediate revocation", () => {
  const f = fixture();
  try {
    const u = portal(f),
      { account } = acc(f);
    f.db.data.user_assignments = f.db.data.user_assignments.filter(
      (a) => a.userId !== u.id,
    );
    const base = {
      userId: u.id,
      businessRole: "owner",
      scopeType: "unit",
      scopeId: f.unit.id,
      permissions: ["workspace.read", "tickets.write"],
      validFrom: "2020-01-01",
      validTo: null,
      retainHistory: true,
      reason: "Собственник",
    };
    const a = saveAssignment(f.db, f.admin, null, base);
    assert.equal(
      contextCan(f.db, u, "workspace.read", "units", f.unit.id),
      true,
    );
    assert.equal(
      contextCan(f.db, u, "workspace.read", "units", f.otherUnit.id),
      false,
    );
    assert.equal(
      contextCan(f.db, u, "finance.read", "personal_accounts", account.id),
      false,
    );
    assert.throws(
      () =>
        saveAssignment(f.db, f.admin, null, {
          ...base,
          permissions: ["finance.read"],
        }),
      /Финансы/,
    );
    const g = saveAssignment(f.db, f.admin, null, {
      ...base,
      scopeType: "account",
      scopeId: account.id,
      permissions: ["finance.read", "work.approve"],
      validTo: "2025-12-31",
    });
    assert.equal(
      contextCan(f.db, u, "finance.read", "personal_accounts", account.id),
      true,
    );
    assert.equal(
      contextCan(f.db, u, "work.approve", "personal_accounts", account.id),
      false,
    );
    revokeAssignment(f.db, f.admin, g.id, "Отозвано");
    assert.equal(
      contextCan(f.db, u, "finance.read", "personal_accounts", account.id),
      false,
    );
    revokeAssignment(f.db, f.admin, a.id, "Продажа");
    assert.equal(
      contextCan(f.db, u, "tickets.write", "units", f.unit.id),
      false,
    );
  } finally {
    f.cleanup();
  }
});
test("Ticket workflow prevents approval/photo/acceptance bypass, invalidates returned-result proof and rejects stale decisions", () => {
  const f = fixture();
  try {
    const { account } = acc(f),
      t = ticket(f),
      u = portal(f),
      w = workflowFor(f.db, t.id),
      stamp = w.updatedAt;
    saveTerms(f.db, f.manager, t.id, {
      updatedAt: stamp,
      paid: true,
      amount: 1000,
      accountId: account.id,
      requireBeforePhoto: true,
      requireAfterPhoto: true,
    });
    assert.throws(
      () => f.db.updateTicket(t.id, { status: "in_progress" }),
      /согласуйте/,
    );
    act(f, u, t.id, "approve");
    assert.throws(() => act(f, f.worker, t.id, "start"), /фото до/);
    photo(f, f.worker, "tickets", t.id, "before");
    act(f, f.worker, t.id, "start");
    assert.throws(() => act(f, f.worker, t.id, "submit"), /фото результата/);
    photo(f, f.worker, "tickets", t.id, "after");
    act(f, f.worker, t.id, "submit");
    assert.throws(
      () => f.db.updateTicket(t.id, { status: "closed" }),
      /приемку/,
    );
    assert.throws(() => act(f, u, t.id, "return", ""), /причин|Возврат/);
    act(f, u, t.id, "return", "Осталась течь");
    assert.equal(workflowFor(f.db, t.id).resultVersion, 2);
    assert.throws(() => act(f, f.worker, t.id, "submit"), /фото результата/);
    photo(f, f.worker, "tickets", t.id, "after");
    act(f, f.worker, t.id, "submit");
    act(f, u, t.id, "accept");
    act(f, f.manager, t.id, "close");
    assert.equal(workflowFor(f.db, t.id).state, "closed");
    assert.throws(
      () =>
        decideTicket(f.db, u, t.id, {
          updatedAt: stamp,
          action: "accept",
          reason: "",
        }),
      /изменена/,
    );
    assert.ok(listDocuments(f.db, u).length >= 3);
    assert.equal(listDocuments(f.db, { ...u, id: "stranger" }).length, 0);
  } finally {
    f.cleanup();
  }
});
test("Readings require an open period and own photo, engineer review is atomic and sends one source-bound outbox message", () => {
  const f = fixture();
  try {
    const { source, account } = acc(f),
      u = portal(f),
      meter = saveOperation(f.db, f.manager, "meters", null, {
        propertyId: f.property.id,
        unitId: f.unit.id,
        name: "Вода",
        resource: "water",
        serialNumber: "001",
        scope: "individual",
        tariff: 10,
        initialValue: 100,
        active: true,
        responsibleId: f.worker.id,
      });
    const period = saveReadingPeriod(f.db, f.manager, {
      propertyId: f.property.id,
      name: "Текущий месяц",
      startsOn: today().slice(0, 7) + "-01",
      endsOn: today(),
      photoRequired: true,
      thresholdPercent: 50,
    });
    const input = {
      meterId: meter.id,
      periodId: period.id,
      accountId: account.id,
      photoDocumentId: null,
      value: 120,
    };
    assert.throws(() => submitReading(f.db, u, input), /фотограф/);
    input.photoDocumentId = photo(f, u, "meters", meter.id).id;
    const row = submitReading(f.db, u, input);
    assert.equal(row.status, "pending");
    assert.equal(f.db.data.resource_readings.length, 0);
    assert.throws(() => submitReading(f.db, u, input), /уже отправлено/);
    assert.throws(
      () =>
        f.db.transaction(() =>
          reviewReading(f.db, f.manager, row.id, {
            updatedAt: row.updatedAt,
            accepted: true,
            reason: "",
          }),
        ),
      /сопоставьте/,
    );
    assert.equal(f.db.data.reading_submissions[0].status, "pending");
    saveExternalLink(f.db, {
      sourceId: source.id,
      entityType: "meters",
      externalId: "meter-1",
      localId: meter.id,
      version: 0,
    });
    const current = f.db.data.reading_submissions[0];
    f.db.transaction(() =>
      reviewReading(f.db, f.manager, row.id, {
        updatedAt: current.updatedAt,
        accepted: true,
        reason: "",
      }),
    );
    assert.equal(f.db.data.resource_readings[0].consumption, 20);
    assert.equal(f.db.data.exchange_outbox.length, 1);
    assert.equal(
      f.db.data.exchange_outbox[0].payload.accountExternalId,
      "account-1",
    );
    assert.throws(
      () =>
        reviewReading(f.db, f.manager, row.id, {
          updatedAt: f.db.data.reading_submissions[0].updatedAt,
          accepted: true,
          reason: "",
        }),
      /уже принято/,
    );
  } finally {
    f.cleanup();
  }
});
test("PPR rescheduling preserves occurrence identity, records reason and produces plan/fact totals", () => {
  const f = fixture();
  try {
    const p = saveOperation(f.db, f.manager, "plans", null, {
      propertyId: f.property.id,
      unitId: f.unit.id,
      name: "Проверка",
      nextDate: today(),
      recurrence: "months",
      intervalCount: 1,
      leadDays: 0,
      checklist: ["Осмотр"],
      active: true,
      responsibleId: f.worker.id,
    });
    const [id] = runMaintenance(f.db, today()),
      t = f.db.getById("tickets", id),
      planned = t.maintenance_date;
    changeMaintenanceTask(f.db, f.manager, id, {
      updatedAt: t.updated_at,
      toDate: new Date(Date.now() + 86400000).toISOString(),
      reason: "Нет доступа",
      remark: "Закрыто помещение",
    });
    assert.equal(t.maintenance_date, planned);
    assert.equal(runMaintenance(f.db, today()).length, 0);
    assert.equal(maintenanceProgress(f.db, f.manager).summary.rescheduled, 1);
    assert.equal(p.id, t.maintenance_plan_id);
  } finally {
    f.cleanup();
  }
});

test("An edited inherited grant stays restricted when staff or contract data is updated", () => {
  const f = fixture();
  try {
    const u = portal(f),
      a = f.db.data.user_assignments.find(
        (a) => a.userId === u.id && a.scopeId === f.lease.id,
      );
    saveAssignment(f.db, f.admin, a.id, {
      userId: u.id,
      businessRole: "tenant",
      scopeType: "lease",
      scopeId: f.lease.id,
      permissions: ["workspace.read", "documents.read"],
      validFrom: a.validFrom,
      validTo: a.validTo,
      retainHistory: true,
      reason: "Финансы переданы бухгалтеру",
      updatedAt: a.updatedAt,
    });
    f.db.updateLease(f.lease.id, { ratePerSqm: 200 });
    assert.equal(
      contextCan(f.db, u, "finance.read", "leases", f.lease.id),
      false,
    );
    assert.equal(
      f.db.data.user_assignments.filter(
        (g) => g.userId === u.id && g.scopeId === f.lease.id,
      ).length,
      1,
    );
  } finally {
    f.cleanup();
  }
});

test("Account-scoped actions cannot cross into another account on the same contract", () => {
  const f = fixture();
  try {
    const u = portal(f),
      { account, source } = acc(f),
      other = saveAccount(f.db, null, {
        sourceId: source.id,
        leaseId: f.lease.id,
        externalId: "second-account",
        number: "002",
        status: "active",
        validFrom: f.lease.start_date,
        validTo: null,
      });
    f.db.data.user_assignments = f.db.data.user_assignments.filter(
      (a) => a.userId !== u.id,
    );
    saveAssignment(f.db, f.admin, null, {
      userId: u.id,
      businessRole: "owner",
      scopeType: "account",
      scopeId: account.id,
      permissions: [
        "workspace.read",
        "finance.read",
        "readings.submit",
        "work.approve",
      ],
      validFrom: "2020-01-01",
      validTo: null,
      retainHistory: true,
      reason: "Один ЛС",
    });
    for (const permission of [
      "finance.read",
      "readings.submit",
      "work.approve",
    ]) {
      assert.equal(
        contextCan(f.db, u, permission, "personal_accounts", account.id),
        true,
      );
      assert.equal(
        contextCan(f.db, u, permission, "personal_accounts", other.id),
        false,
      );
    }
  } finally {
    f.cleanup();
  }
});
