// Operations run inside the same SQL transaction as authentication. An OTP cannot
// be consumed twice by requests arriving at different API instances.
export class PostgresTtlStore {
  constructor(namespace, db) {
    this.namespace = namespace;
    this.db = db;
    this.backend = "postgres";
  }
  get(key) {
    const entry = this.db.data.auth_challenges.find(
      (row) => row.namespace === this.namespace && row.key === key,
    );
    return entry && Date.parse(entry.expiresAt) > Date.now()
      ? structuredClone(entry.value)
      : null;
  }
  set(key, value, ttlMs) {
    const time = Date.now();
    this.db.data.auth_challenges = this.db.data.auth_challenges.filter(
      (row) =>
        Date.parse(row.expiresAt) > time &&
        !(row.namespace === this.namespace && row.key === key),
    );
    this.db.data.auth_challenges.push({
      namespace: this.namespace,
      key,
      value: structuredClone(value),
      expiresAt: new Date(time + ttlMs).toISOString(),
    });
  }
  delete(key) {
    this.db.data.auth_challenges = this.db.data.auth_challenges.filter(
      (row) => !(row.namespace === this.namespace && row.key === key),
    );
  }
}
