import { useEffect, useState } from "react";
import { apiRequest } from "../../../api/client";
import type {
  FloorPlan,
  PlanGeometry,
  Structure,
} from "../../../../../../packages/contracts/src/operations-platform";
import type { Unit, Ticket, Row } from "../../operations/shared";
import { isOpenTicket } from "../../../../../../packages/contracts/src/domain.js";
import { bounds, download, exportDxf, View } from "./geometry";
export type PlanEditorProps = {
  token: string;
  propertyId: string;
  structure: Structure;
  units: Unit[];
  tickets: Ticket[];
  equipment: Row[];
  onUnit: (id: string) => void;
  onTicket?: (id: string) => void;
  canWrite?: boolean;
};
export function usePlanEditor(props: PlanEditorProps) {
  const [imageHeight, setImageHeight] = useState(700);
  const [plans, setPlans] = useState<FloorPlan[]>([]),
    [draft, setDraft] = useState<FloorPlan | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>({
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
    }),
    [hidden, setHidden] = useState<string[]>([]),
    [selected, select] = useState(""),
    [tool, setTool] = useState("pan");
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    if (!draft?.image) {
      setImageHeight(700);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active && image.naturalWidth) {
        const height = (1000 * image.naturalHeight) / image.naturalWidth;
        setImageHeight(height);
        setView(bounds(draft.geometry, draft.image, height));
      }
    };
    image.onerror = () => {
      if (active) setError("Не удалось загрузить подложку плана");
    };
    image.src = draft.image;
    return () => {
      active = false;
    };
  }, [draft?.image]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    apiRequest<{ floorplans: FloorPlan[] }>("/api/operations", {
      token: props.token,
    })
      .then((d) => {
        if (!active) return;
        setPlans(d.floorplans);
        setDraft(null);
        setDirty(false);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.token, props.propertyId]);
  const update = (patch: Partial<FloorPlan>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const open = (p: FloorPlan) => {
    setDraft(structuredClone(p));
    setView(bounds(p.geometry, p.image));
    setHidden([]);
    select("");
    setPoints([]);
    setDirty(false);
    setNotice("");
  };
  const create = () => {
    open({
      id: "",
      propertyId: props.propertyId,
      name: "Новый план",
      kind: "site",
      floorId: null,
      image: "",
      geometry: [],
      layers: [],
      markers: [],
      sourceName: "",
      version: 0,
      updatedAt: "",
    });
    setDirty(true);
  };
  const unitOptions = props.units.filter(
    (u) =>
      u.propertyId === props.propertyId &&
      (!draft?.floorId || u.floorId === draft.floorId),
  );
  const shape = draft?.geometry.find((s) => s.id === selected);
  const unitId =
    shape?.unitId ?? (selected.startsWith("marker:") ? selected.slice(7) : "");
  const equipment = props.equipment.filter((e) =>
    unitOptions.some((u) => u.id === e.unitId),
  );
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const { id, updatedAt, ...fields } = draft;
      const body = {
        propertyId: fields.propertyId,
        name: fields.name,
        kind: fields.kind,
        floorId: fields.floorId,
        image: fields.image,
        geometry: fields.geometry,
        layers: fields.layers,
        markers: fields.markers,
        sourceName: fields.sourceName,
        version: fields.version,
        ...(id ? { updatedAt } : {}),
      };
      const result = await apiRequest<{ item: FloorPlan }>(
        `/api/operations/floorplans${id ? "/" + id : ""}`,
        { token: props.token, method: id ? "PUT" : "POST", body },
      );
      setPlans((p) => [
        ...p.filter((v) => v.id !== result.item.id),
        result.item,
      ]);
      open(result.item);
      setNotice("План сохранён");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File) => {
    setError("");
    if (file.size > 8 * 1024 * 1024) {
      setError("Файл должен быть не больше 8 МБ");
      return;
    }
    setBusy(true);
    try {
      if (/\.dxf$/i.test(file.name)) {
        const result = await apiRequest<{
          geometry: PlanGeometry;
          layers: string[];
          warnings: string[];
        }>("/api/operations/floorplans/import-dxf", {
          token: props.token,
          method: "POST",
          body: { content: await file.text() },
        });
        update({
          geometry: result.geometry,
          layers: result.layers,
          sourceName: file.name,
          image: "",
          markers: [],
        });
        setView(bounds(result.geometry, ""));
        setNotice(
          `Импортировано ${result.geometry.length} элементов. ${result.warnings.length ? result.warnings.join("; ") : "Все элементы обработаны."} Проверьте план и сохраните.`,
        );
      } else if (
        ["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ) {
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Подложка должна быть не больше 2 МБ");
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        update({ image, sourceName: file.name });
        setView(bounds(draft?.geometry ?? [], image));
      } else throw new Error("Поддерживаются текстовый DXF, PNG, JPEG и WebP");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const patchShape = (patch: Partial<PlanGeometry[number]>) =>
    update({
      geometry: draft!.geometry.map((s) =>
        s.id === selected ? { ...s, ...patch } : s,
      ),
    });
  return {
    plans,
    draft,
    setDraft,
    error,
    notice,
    busy,
    dirty,
    setDirty,
    view,
    setView,
    hidden,
    setHidden,
    selected,
    select,
    tool,
    setTool,
    points,
    setPoints,
    update,
    open,
    create,
    unitOptions,
    shape,
    unitId,
    equipment,
    save,
    importFile,
    patchShape,
    imageHeight,
  };
}
