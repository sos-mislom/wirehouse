import { contextCan } from "./context-access.js";

export function canReadFinancialPeriod(db, actor, leaseId, period) {
  return contextCan(
    db,
    actor,
    "finance.read",
    "leases",
    leaseId,
    undefined,
    period + "-01",
  );
}

export function canReadInvoice(db, actor, invoice) {
  return canReadFinancialPeriod(db, actor, invoice.lease_id, invoice.period);
}
