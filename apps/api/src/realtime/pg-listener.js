import pg from "pg";
import { parseRealtimeServerMessage } from "../../../../packages/contracts/src/realtime.ts";

// NOTIFY is only a wake-up signal; the durable SQL revision repairs missed signals.
export function listenForChanges(databaseUrl, { onChange, onReady }) {
  let stopped = false,
    client,
    timer,
    attempt = 0;
  const connect = async () => {
    if (stopped) return;
    const current = new pg.Client({
      connectionString: databaseUrl,
      application_name: "wirehouse-realtime",
      connectionTimeoutMillis: 5000,
    });
    client = current;
    let lost = false;
    const reconnect = () => {
      if (lost) return;
      lost = true;
      void current.end().catch(() => {});
      if (!stopped)
        timer = setTimeout(
          connect,
          Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) *
            (0.8 + Math.random() * 0.4),
        );
    };
    current.on("error", reconnect);
    current.on("end", reconnect);
    current.on("notification", ({ channel, payload }) => {
      if (channel !== "wirehouse_changes" || stopped) return;
      try {
        const event = parseRealtimeServerMessage(JSON.parse(payload));
        if (!event || event.type !== "invalidate")
          throw new Error("Invalid notification");
        onChange(event);
      } catch {
        console.error("Invalid realtime database notification");
      }
    });
    try {
      await current.connect();
      if (stopped) {
        await current.end();
        return;
      }
      await current.query("LISTEN wirehouse_changes");
      // LISTEN first, then checkpoint: closes the subscription startup race.
      const { rows } = await current.query(
        "SELECT epoch::text, revision::text FROM warehouse.realtime_state WHERE id",
      );
      attempt = 0;
      if (!stopped && !lost) onReady(rows[0]);
    } catch {
      reconnect();
    }
  };
  void connect();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await client?.end().catch(() => {});
  };
}
