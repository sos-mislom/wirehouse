export function nextVersionTime(previous) {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}
