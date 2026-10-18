import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import type { Page } from "../../../../../packages/contracts/src/registry";
import { initialPageSize } from "./register-preferences";

export function usePagedResource<T>(
  token: string,
  path: string,
  title: string,
) {
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(() => initialPageSize(title)),
    [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
      key: string;
      page: Page<T>;
    } | null>(null),
    [failure, setFailure] = useState<{ key: string; message: string } | null>(
      null,
    );
  const key = JSON.stringify([token, path, query, offset, limit, revision]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      const url =
        path +
        (path.includes("?") ? "&" : "?") +
        new URLSearchParams({
          q: query,
          offset: String(offset),
          limit: String(limit),
        });
      void apiRequest<Page<T>>(url, { token, signal: abort.signal })
        .then((page) => {
          if (abort.signal.aborted) return;
          if (offset && offset >= page.total) {
            setOffset(
              page.total ? Math.floor((page.total - 1) / limit) * limit : 0,
            );
            return;
          }
          setResponse({ key, page });
        })
        .catch((error: Error) => {
          if (!abort.signal.aborted)
            setFailure({ key, message: error.message });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [key, token, path, query, offset, limit]);
  // A changed filter cannot display or select rows from an older response.
  const page = response?.key === key ? response.page : null;
  const error = failure?.key === key && !page ? failure.message : "";
  return {
    items: page?.items ?? [],
    total: page?.total ?? 0,
    query,
    offset,
    limit,
    loading: !page && !error,
    error,
    reload: () => setRevision((v) => v + 1),
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
      setRevision((v) => v + 1);
    },
  };
}
