import { execFileSync } from "node:child_process";

export class RedisTtlStore {
  constructor(prefix, redisUrl, redisCliBin) {
    this.prefix = prefix;
    this.redisUrl = redisUrl;
    this.redisCliBin = redisCliBin;
    this.backend = "redis";
    if (!redisUrl) throw new Error("Redis URL is required");
    const pong = this.runRedis(["PING"]).trim();
    if (pong !== "PONG") throw new Error("Redis did not return PONG");
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
    this.runRedis([
      "SETEX",
      this.key(key),
      String(Math.max(1, Math.ceil(ttlMs / 1000))),
      JSON.stringify(value),
    ]);
  }

  get(key) {
    const value = this.runRedis(["GET", this.key(key)]).trim();
    return value ? JSON.parse(value) : null;
  }

  delete(key) {
    this.runRedis(["DEL", this.key(key)]);
  }
}
