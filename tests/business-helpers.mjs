import {
  saveReadingPeriod,
  submitReading,
  reviewReading,
} from "../apps/api/src/domain/readings.js";
import { saveSource, saveAccount } from "../apps/api/src/domain/accounting.js";
import {
  saveTerms,
  workflowFor,
  decideTicket,
  publishedEstimate,
} from "../apps/api/src/domain/ticket-workflow.js";
export function acceptedReading(db, admin, meterId, body, submitter = admin) {
  const meter = db.getById("meters", meterId),
    today = new Date().toISOString().slice(0, 10);
  const period =
    db.data.reading_periods.find(
      (p) =>
        p.propertyId === meter.propertyId &&
        p.startsOn.slice(0, 7) === body.period,
    ) ??
    saveReadingPeriod(db, admin, {
      propertyId: meter.propertyId,
      name: body.period,
      startsOn: body.period + "-01",
      endsOn: today,
      photoRequired: false,
      thresholdPercent: 50,
    });
  const submission = submitReading(db, submitter, {
    meterId,
    periodId: period.id,
    accountId: null,
    photoDocumentId: null,
    value: body.value,
  });
  db.transaction(() =>
    reviewReading(db, admin, submission.id, {
      updatedAt: submission.updatedAt,
      accepted: true,
      reason: "Проверено инженером",
    }),
  );
  return db.data.resource_readings.find(
    (r) => r.meterId === meterId && r.period === body.period,
  );
}
export function preparePaidWork(db, admin, ticketId, leaseId) {
  const t = db.getById("tickets", ticketId);
  t.lease_id = leaseId;
  const source = saveSource(db, admin, null, {
      name: "Тест",
      environment: "test",
      active: true,
    }),
    account = saveAccount(db, null, {
      sourceId: source.id,
      leaseId,
      externalId: "account-" + ticketId,
      number: "001",
      status: "active",
      validFrom: "2020-01-01",
      validTo: null,
    });
  saveTerms(db, admin, ticketId, {
    updatedAt: workflowFor(db, ticketId).updatedAt,
    paid: true,
    amount: publishedEstimate(db, ticketId)?.total ?? 1000,
    accountId: account.id,
    requireBeforePhoto: false,
    requireAfterPhoto: false,
  });
  decideTicket(db, admin, ticketId, {
    updatedAt: workflowFor(db, ticketId).updatedAt,
    action: "approve",
    reason: "",
  });
  db.updateTicket(ticketId, { status: "in_progress", updatedBy: admin.id });
}
