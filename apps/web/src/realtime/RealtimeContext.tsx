import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { apiRequest, runtimeApiBase } from "../api/client";
import { QueryClient } from "./query-client";
import { connectRealtime } from "./connection";
const Context = createContext<QueryClient | null>(null);
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient((token, path, signal) =>
        apiRequest(path, { token, signal }),
      ),
  );
  useEffect(() => () => client.dispose(), [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useQueryClient() {
  const client = useContext(Context);
  if (!client) throw new Error("RealtimeProvider required");
  return client;
}
export function useRealtimeSession(
  token: string | undefined,
  unauthorized: () => void,
) {
  const client = useQueryClient(),
    onUnauthorized = useRef(unauthorized);
  onUnauthorized.current = unauthorized;
  useEffect(() => {
    client.clearExcept(token ?? null);
    if (!token) return;
    const fail = () => onUnauthorized.current();
    client.onUnauthorized = fail;
    const url = new URL("/api/realtime", runtimeApiBase || location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const stop = connectRealtime({
      token,
      url: url.href,
      queries: client,
      checkpoint: (signal) =>
        apiRequest("/api/realtime/state", { token, signal }),
      unauthorized: fail,
    });
    return () => {
      client.onUnauthorized = undefined;
      stop();
    };
  }, [token, client]);
}
export function useLiveQuery<T>(
  token: string | undefined,
  path: string,
  initial: T,
  { enabled = true, delay = 0 } = {},
) {
  const client = useQueryClient();
  const active = Boolean(token && enabled);
  const empty = useRef({
    data: undefined as T | undefined,
    error: "",
    loading: false,
  }).current;
  const subscribe = useCallback(
    (fn: () => void) =>
      active ? client.subscribe(token!, path, fn, delay) : () => {},
    [client, active, token, path, delay],
  );
  const snapshot = useCallback(
    () => (active ? client.snapshot<T>(token!, path) : empty),
    [client, active, token, path, empty],
  );
  const value = useSyncExternalStore(subscribe, snapshot);
  const load = useCallback(
    () => client.request<T>(token!, path, true),
    [client, token, path],
  );
  return { ...value, data: value.data ?? initial, load, reload: load };
}
// Variable-length query groups (chat threads) share the same cache and requests.
export function useLiveBatch(token: string | undefined, paths: string[]) {
  const client = useQueryClient(),
    key = JSON.stringify(paths);
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!token) return () => {};
      const stops = (JSON.parse(key) as string[]).map((path) =>
        client.subscribe(token, path, fn),
      );
      return () => stops.forEach((stop) => stop());
    },
    [client, token, key],
  );
  return useSyncExternalStore(subscribe, client.revision);
}
