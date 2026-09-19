import { useEffect, useRef } from "react";
export const initialRoute = Object.fromEntries(
  new URLSearchParams(window.location.hash.slice(1)),
);
export function useBrowserNavigation(
  route: Record<string, string>,
  restore: (value: Record<string, string>) => void,
  enabled: boolean,
) {
  const last = useRef("");
  const restoring = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    const onPop = () => {
      restoring.current = true;
      restoreRef.current(
        Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))),
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const serialized = new URLSearchParams(route).toString();
  useEffect(() => {
    if (!enabled) return;
    if (restoring.current) {
      restoring.current = false;
      last.current = serialized;
      return;
    }
    if (last.current === serialized) return;
    const previous = new URLSearchParams(last.current);
    const next = new URLSearchParams(serialized);
    const changedScreen = [
      "screen",
      "section",
      "tab",
      "ticket",
      "tenant",
      "unit",
    ].some((key) => previous.get(key) !== next.get(key));
    const method = last.current && changedScreen ? "pushState" : "replaceState";
    window.history[method](
      { wirehouse: true },
      "",
      `${window.location.pathname}${window.location.search}#${serialized}`,
    );
    last.current = serialized;
  }, [serialized, enabled]);
}
