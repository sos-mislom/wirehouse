import { execFileSync } from "node:child_process";

export class TtlStore {
  constructor(prefix, redisUrl, redisCliBin) {
    this.prefix = prefix;
    this.redisUrl = redisUrl;
    this.redisCliBin = redisCliBin;
    this.entries = new Map();
    this.redisEnabled = Boolean(redisUrl);
    if (this.redisEnabled) {
      // An explicitly configured Redis is required. Never downgrade authentication storage.
      const pong = this.runRedis(["PING"]).trim();
      if (pong !== "PONG") throw new Error("Redis did not return PONG");
    }
  }

  key(key) {
    return `${this.prefix}:${key}`;
  }

  runRedis(args) {
    return execFileSync(
      this.redisCliBin,
      ["-u", this.redisUrl, "--raw", ...args],
      {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  }

  set(key, value, ttlMs) {
    if (this.redisEnabled) {
      this.runRedis([
        "SETEX",
        this.key(key),
        String(Math.max(1, Math.ceil(ttlMs / 1000))),
        JSON.stringify(value),
      ]);
      return;
    }
    for (const [storedKey, entry] of this.entries) {
      if (entry.expiresAt <= Date.now()) this.entries.delete(storedKey);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key) {
    if (this.redisEnabled) {
      const value = this.runRedis(["GET", this.key(key)]).trim();
      return value ? JSON.parse(value) : null;
    }
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key) {
    if (this.redisEnabled) {
      this.runRedis(["DEL", this.key(key)]);
      return;
    }
    this.entries.delete(key);
  }
}
