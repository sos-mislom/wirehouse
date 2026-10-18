import { useLiveQuery } from "../../realtime/RealtimeContext";
import { useRef, useState } from "react";
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
  const resource = useLiveQuery<PlatformData>(token, "/api/maintenance", {
    templates: [],
    materials: [],
    contractors: [],
    estimates: [],
    estimateTicketIds: [],
    acts: [],
  });
  const { data, load: reload } = resource;
  const [failure, setError] = useState("");
  const error = failure || resource.error;
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mutate = async (path: string, body: unknown, method = "POST") => {
    if (pending.current) return false;
    pending.current = true;
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
      pending.current = false;
      setBusy(false);
    }
  };
  return { data, error, setError, busy, mutate, reload };
}
