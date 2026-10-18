import { useEffect, useState } from "react";
import { useLiveQuery } from "../../realtime/RealtimeContext";
import type { Page } from "../../../../../packages/contracts/src/registry";
import { initialPageSize } from "./register-preferences";
export function usePagedResource<T>(
  token: string,
  path: string,
  title: string,
) {
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(() => initialPageSize(title));
  const url =
    path +
    (path.includes("?") ? "&" : "?") +
    new URLSearchParams({
      q: query,
      offset: String(offset),
      limit: String(limit),
    });
  const resource = useLiveQuery<Page<T> | null>(token, url, null, {
    delay: 200,
  });
  const page = resource.data;
  useEffect(() => {
    if (page && offset && offset >= page.total)
      setOffset(page.total ? Math.floor((page.total - 1) / limit) * limit : 0);
  }, [page, offset, limit]);
  return {
    items: page?.items ?? [],
    total: page?.total ?? 0,
    query,
    offset,
    limit,
    loading: resource.loading,
    error: resource.error,
    reload: () => {
      void resource.load().catch(() => {});
    },
    setQuery: (value: string) => {
      setQuery(value);
      setOffset(0);
    },
    setLimit: (value: number) => {
      setLimit(value);
      setOffset(0);
    },
    setOffset,
    reset: () => {
      setOffset(0);
      void resource.load().catch(() => {});
    },
  };
}
