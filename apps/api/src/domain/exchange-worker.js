import { processExchange } from "./accounting.js";
export function retryExchange(db, environment, at = new Date().toISOString()) {
  const due = db.data.exchange_inbox
    .filter(
      (r) =>
        r.status === "failed" &&
        r.attempts < 8 &&
        r.nextAttemptAt &&
        r.nextAttemptAt <= at &&
        db.data.accounting_sources.some(
          (s) =>
            s.id === r.sourceId && s.active && s.environment === environment,
        ),
    )
    .slice(0, 20);
  for (const row of due)
    processExchange(db, row.sourceId, row.payload, environment);
  return due.length;
}
