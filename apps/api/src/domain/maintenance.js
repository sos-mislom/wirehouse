export function nextOccurrence(plan, occurrence) {
  const date = new Date(`${occurrence}T12:00:00Z`);
  const recurrence = plan.recurrence;
  const count = plan.intervalCount;
  if (recurrence === "days" || recurrence === "weeks")
    date.setUTCDate(
      date.getUTCDate() + count * (recurrence === "weeks" ? 7 : 1),
    );
  else {
    const day = plan.anchorDay ?? date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(
      date.getUTCMonth() + count * (recurrence === "years" ? 12 : 1),
    );
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}
