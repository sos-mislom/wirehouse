import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import type {
  CatalogItem,
  EstimateView,
  ServiceAct,
} from "../../../../../packages/contracts/src/operations-platform";
export type PlatformData = {
  templates: CatalogItem[];
  materials: CatalogItem[];
  contractors: CatalogItem[];
  estimates: EstimateView[];
  estimateTicketIds: string[];
  acts: ServiceAct[];
};
export function usePlatform(token: string) {
  const [data, setData] = useState<PlatformData>({
    templates: [],
    materials: [],
    contractors: [],
    estimates: [],
    estimateTicketIds: [],
    acts: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(
    async () =>
      setData(await apiRequest<PlatformData>("/api/maintenance", { token })),
    [token],
  );
  useEffect(() => {
    let active = true;
    apiRequest<PlatformData>("/api/maintenance", { token })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const mutate = async (path: string, body: unknown, method = "POST") => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await apiRequest(path, { token, method, body });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setError("");
    try {
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить данные");
    }
  };
  return { data, error, setError, busy, mutate, reload, refresh };
}
