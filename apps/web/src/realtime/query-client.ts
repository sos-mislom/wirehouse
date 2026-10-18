import {
  resourcesForPath,
  type RealtimeResource,
} from "../../../../packages/contracts/src/realtime.ts";

export type QuerySnapshot<T> = { data?: T; error: string; loading: boolean };
type Entry = {
  token: string;
  path: string;
  snapshot: QuerySnapshot<unknown>;
  stale: boolean;
  listeners: Set<() => void>;
  pending?: Promise<unknown>;
  abort?: AbortController;
  generation: number;
  attempts: number;
  retry?: ReturnType<typeof setTimeout>;
  touched: number;
};
type Read = <T>(token: string, path: string, signal: AbortSignal) => Promise<T>;

export class QueryClient {
  private entries = new Map<string, Entry>();
  private queued = new Set<Entry>();
  private timer?: ReturnType<typeof setTimeout>;
  private version = 0;
  onUnauthorized?: () => void;
  private read: Read;
  private batchMs: number;
  constructor(read: Read, batchMs = 200) {
    this.read = read;
    this.batchMs = batchMs;
  }
  private entry(token: string, path: string) {
    const key = JSON.stringify([token, path]);
    let e = this.entries.get(key);
    if (!e) {
      e = {
        token,
        path,
        snapshot: { error: "", loading: true },
        stale: true,
        listeners: new Set(),
        generation: 0,
        attempts: 0,
        touched: Date.now(),
      };
      this.entries.set(key, e);
      if (this.entries.size > 150) {
        for (const [key, entry] of [...this.entries].sort(
          (a, b) => a[1].touched - b[1].touched,
        )) {
          if (this.entries.size <= 100) break;
          if (entry !== e && !entry.listeners.size && !entry.pending) {
            clearTimeout(entry.retry);
            this.entries.delete(key);
          }
        }
      }
    }
    e.touched = Date.now();
    return e;
  }
  snapshot<T>(token: string, path: string) {
    return this.entry(token, path).snapshot as QuerySnapshot<T>;
  }
  revision = () => this.version;
  private publish(e: Entry, snapshot: QuerySnapshot<unknown>) {
    e.snapshot = snapshot;
    this.version++;
    for (const listener of e.listeners) listener();
  }
  subscribe(token: string, path: string, listener: () => void, delay = 0) {
    const e = this.entry(token, path);
    e.listeners.add(listener);
    const timer = setTimeout(() => {
      if (e.stale) void this.fetch(e).catch(() => {});
    }, delay);
    return () => {
      clearTimeout(timer);
      e.listeners.delete(listener);
      if (!e.listeners.size) {
        clearTimeout(e.retry);
        e.retry = undefined;
        // Inactive queries must not retry or race a changed search filter.
        e.stale = true;
        e.abort?.abort();
      }
    };
  }
  request<T>(token: string, path: string, force = false): Promise<T> {
    const e = this.entry(token, path);
    if (force) e.stale = true;
    if (!e.stale && e.snapshot.data !== undefined)
      return Promise.resolve(e.snapshot.data as T);
    return this.fetch(e) as Promise<T>;
  }
  private fetch(e: Entry): Promise<unknown> {
    if (e.pending) return e.pending;
    clearTimeout(e.retry);
    e.retry = undefined;
    this.queued.delete(e);
    const generation = e.generation;
    const abort = new AbortController();
    e.abort = abort;
    e.stale = false;
    this.publish(e, { ...e.snapshot, loading: true });
    const pending = Promise.resolve()
      .then(() => this.read(e.token, e.path, abort.signal))
      .then((data) => {
        if (abort.signal.aborted) return data;
        e.attempts = 0;
        this.publish(e, { data, error: "", loading: false });
        return data;
      })
      .catch((error: unknown) => {
        e.stale = true;
        if (abort.signal.aborted) throw error;
        const status = (error as { status?: number }).status ?? 0;
        const retryable =
          !status || status >= 500 || status === 408 || status === 429;
        this.publish(e, {
          data:
            status === 401 || status === 403 || status === 404
              ? undefined
              : e.snapshot.data,
          error: `${error instanceof Error ? error.message : "Не удалось загрузить данные"}${retryable ? " Повторяем автоматически…" : ""}`,
          loading: false,
        });
        if (status === 401) this.onUnauthorized?.();
        if (retryable && e.listeners.size) {
          const delay =
            Math.min(30000, 1000 * 2 ** Math.min(e.attempts++, 5)) *
            (0.8 + Math.random() * 0.4);
          e.retry = setTimeout(() => {
            e.retry = undefined;
            void this.fetch(e).catch(() => {});
          }, delay);
        }
        throw error;
      })
      .finally(() => {
        if (e.pending !== pending) return;
        e.pending = undefined;
        e.abort = undefined;
        // Changes committed during an HTTP read require exactly one follow-up.
        if (
          (generation !== e.generation || abort.signal.aborted) &&
          e.listeners.size
        ) {
          e.stale = true;
          this.queued.add(e);
          this.schedule();
        }
      });
    e.pending = pending;
    return pending;
  }
  invalidate(token: string, resources?: readonly RealtimeResource[]) {
    for (const e of this.entries.values()) {
      if (
        e.token !== token ||
        (resources &&
          !resourcesForPath(e.path).some((r) => resources.includes(r)))
      )
        continue;
      e.stale = true;
      e.generation++;
      if (e.listeners.size) this.queued.add(e);
    }
    this.schedule();
  }
  private schedule() {
    // Fixed window, not a trailing debounce: continuous events cannot starve reads.
    if (this.timer || !this.queued.size) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const entries = [...this.queued];
      this.queued.clear();
      for (const e of entries)
        if (e.stale && e.listeners.size && !e.pending)
          void this.fetch(e).catch(() => {});
    }, this.batchMs);
  }
  clearExcept(token: string | null) {
    for (const [key, e] of this.entries)
      if (e.token !== token) {
        e.listeners.clear();
        e.abort?.abort();
        clearTimeout(e.retry);
        this.queued.delete(e);
        this.entries.delete(key);
      }
  }
  dispose() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queued.clear();
    this.clearExcept(null);
  }
}
