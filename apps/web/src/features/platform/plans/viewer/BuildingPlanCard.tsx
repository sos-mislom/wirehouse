import { useEffect, useMemo, useState } from "react";
import type {
  FloorPlan,
  Structure,
} from "../../../../../../../packages/contracts/src/operations-platform";
import { useLiveQuery } from "../../../../realtime/RealtimeContext";
import { Button, IconButton, Select } from "../../../../ui";
import { SidePanel } from "../../../../ui/SidePanel";
import { ActionIcon } from "../../../business/ActionIcon";
import type { Ticket, Unit } from "../../../operations/shared";
import { isOpenTicket } from "../../../../../../../packages/contracts/src/domain";
import { downloadDxf } from "../dxf-download";
import { bounds, exportDxf, type View } from "../geometry";
import { PlanCanvas } from "../PlanCanvas";
import "./plan-viewer.css";
import { copy } from "../../../../projectData";
import { formatArea } from "../../../../shared/format";
import { planContextLabel } from "./plan-label";

type Props = {
  token: string;
  propertyId: string;
  buildingId?: string | null;
  units: Unit[];
  tickets: Ticket[];
  onEdit?: (plan: FloorPlan) => void;
  compact?: boolean;
  title?: string;
};
const noop = () => {};

export function BuildingPlanCard(props: Props) {
  const resource = useLiveQuery<{ floorplans: FloorPlan[] }>(
    props.token,
    "/api/operations",
    { floorplans: [] },
  );
  const structure = useLiveQuery<Structure>(props.token, "/api/structure", {
    buildings: [],
    entrances: [],
    floors: [],
  });
  const propertyPlans = (resource.data.floorplans ?? []).filter(
    (plan) => plan.propertyId === props.propertyId,
  );
  const viewerPlans = propertyPlans
    .filter((plan) => !props.buildingId || plan.buildingId === props.buildingId)
    .sort((a, b) => {
      const rank = { site: 0, building: 1, floor: 2 };
      return (
        rank[a.kind] - rank[b.kind] ||
        a.name.localeCompare(b.name, "ru", { numeric: true }) ||
        a.id.localeCompare(b.id)
      );
    });
  const plans = propertyPlans.filter(
    (plan) =>
      plan.propertyId === props.propertyId &&
      (props.buildingId
        ? plan.kind === "building" && plan.buildingId === props.buildingId
        : plan.kind === "site" && !plan.floorId && !plan.buildingId),
  );
  const usable = (item: FloorPlan) =>
    Boolean(item.geometry.length || item.image || item.markers.length);
  const plan = [...plans].sort(
    (a, b) =>
      Number(usable(b)) - Number(usable(a)) ||
      Number(Boolean(a.isDefault)) - Number(Boolean(b.isDefault)) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id),
  )[0];
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const viewedPlan = selectedId
    ? viewerPlans.find((item) => item.id === selectedId)
    : plan;
  const label =
    props.title ?? (props.buildingId ? "План корпуса" : "План здания");
  const imageHeight = useImageHeight(plan?.image ?? "");
  const fitted = useMemo(
    () => (plan ? bounds(plan.geometry, plan.image, imageHeight) : undefined),
    [plan?.id, plan?.version, plan?.updatedAt, imageHeight],
  );
  useEffect(() => {
    setOpen(false);
    setSelectedId("");
  }, [props.propertyId, props.buildingId]);
  const openPlan = () => {
    if (!plan) return;
    setSelectedId(plan.id);
    setOpen(true);
  };
  return (
    <section
      className={`building-plan-card ${props.compact ? "building-plan-card--compact" : "mvp-card"}`}
      aria-label={label}
    >
      <div className="building-plan-card__heading">
        {props.compact ? <h5>{label}</h5> : <h3>{label}</h3>}
        {plan && (
          <IconButton
            label={`Открыть: ${label.toLocaleLowerCase("ru")}`}
            onClick={openPlan}
          >
            <ActionIcon name="fit" />
          </IconButton>
        )}
      </div>
      {plan && fitted ? (
        <>
          <button
            type="button"
            className="building-plan-preview"
            onClick={openPlan}
            aria-label={`Открыть ${label.toLocaleLowerCase("ru")}: ${plan.name}`}
          >
            <PlanCanvas
              plan={plan}
              imageHeight={imageHeight}
              view={fitted}
              setView={noop}
              hidden={[]}
              selected=""
              select={noop}
              tool="view"
              points={[]}
              addPoint={noop}
              updateGeometry={noop}
              ticketUnits={new Set()}
              unitLabels={new Map()}
              readOnly
              interactive={false}
              ariaLabel={plan.name}
            />
          </button>
          <div className="building-plan-card__caption">
            <span>{plan.name}</span>
            {plan.isDefault && <small>Базовая схема</small>}
          </div>
        </>
      ) : resource.error ? (
        <div className="building-plan-card__empty" role="alert">
          <p>{resource.error}</p>
          <Button onClick={() => void resource.load()}>Повторить</Button>
        </div>
      ) : (
        <p
          className="building-plan-card__empty"
          role={resource.loading ? "status" : undefined}
        >
          {resource.loading || !resource.hasData
            ? "Загрузка плана…"
            : "План не добавлен"}
        </p>
      )}
      {open && viewedPlan && (
        <PlanViewer
          plan={viewedPlan}
          plans={viewerPlans}
          structure={structure.data}
          units={props.units}
          tickets={props.tickets}
          onSelectPlan={setSelectedId}
          onClose={() => setOpen(false)}
          onEdit={
            props.onEdit
              ? () => {
                  setOpen(false);
                  props.onEdit?.(viewedPlan);
                }
              : undefined
          }
        />
      )}
      {open && !viewedPlan && (
        <SidePanel title="План недоступен" onClose={() => setOpen(false)}>
          <p>Выбранный план больше недоступен.</p>
          <Button onClick={() => setOpen(false)}>Вернуться к зданию</Button>
        </SidePanel>
      )}
    </section>
  );
}

function useImageHeight(source: string) {
  const [height, setHeight] = useState(700);
  useEffect(() => {
    if (!source) {
      setHeight(700);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active && image.naturalWidth)
        setHeight((1000 * image.naturalHeight) / image.naturalWidth);
    };
    image.src = source;
    return () => {
      active = false;
    };
  }, [source]);
  return height;
}

function PlanViewer({
  plan,
  plans,
  structure,
  units,
  tickets,
  onSelectPlan,
  onClose,
  onEdit,
}: {
  plan: FloorPlan;
  plans: FloorPlan[];
  structure: Structure;
  units: Unit[];
  tickets: Ticket[];
  onSelectPlan: (id: string) => void;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const imageHeight = useImageHeight(plan.image);
  const fit = useMemo(
    () => bounds(plan.geometry, plan.image, imageHeight),
    [plan.id, plan.version, plan.updatedAt, imageHeight],
  );
  const [view, setView] = useState<View>(fit);
  const [selected, select] = useState("");
  useEffect(() => {
    setView(fit);
    select("");
  }, [fit]);
  const propertyUnits = units.filter(
    (unit) =>
      unit.propertyId === plan.propertyId &&
      (!plan.floorId || unit.floorId === plan.floorId),
  );
  const unitLabels = new Map(
    propertyUnits.map((unit) => [unit.id, unit.number]),
  );
  const ticketUnits = new Set(
    tickets
      .filter((ticket) => isOpenTicket(ticket.status))
      .map((ticket) => ticket.unitId),
  );
  const shape = plan.geometry.find((item) => item.id === selected);
  const selectedUnitId =
    shape?.unitId ?? (selected.startsWith("marker:") ? selected.slice(7) : "");
  const selectedUnit = propertyUnits.find((unit) => unit.id === selectedUnitId);
  const zoom = (factor: number) =>
    setView((current) => {
      const width = Math.max(0.1, Math.min(1e10, current.width * factor));
      const ratio = width / current.width;
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - current.height * ratio) / 2,
        width,
        height: current.height * ratio,
      };
    });
  return (
    <SidePanel
      title={
        plan.kind === "floor"
          ? "План этажа"
          : plan.kind === "building"
            ? "План корпуса"
            : "Генплан"
      }
      onClose={onClose}
      footer={
        selectedUnit ? (
          <div className="plan-viewer__room" aria-live="polite">
            <div className="plan-viewer__room-heading">
              <strong>Помещение {selectedUnit.number}</strong>
              <div className="ui-actions">
                {onEdit && (
                  <IconButton label="Редактировать план" onClick={onEdit}>
                    <ActionIcon name="edit" />
                  </IconButton>
                )}
                <IconButton
                  label="Снять выбор помещения"
                  onClick={() => select("")}
                >
                  <ActionIcon name="close" />
                </IconButton>
              </div>
            </div>
            <div className="plan-viewer__room-meta">
              <span>{formatArea(selectedUnit.area, "ru")}</span>
              <span>
                {copy.ru.unitStatuses[
                  selectedUnit.status as keyof typeof copy.ru.unitStatuses
                ] ?? selectedUnit.status}
              </span>
              <span>Этаж {selectedUnit.floor}</span>
            </div>
            {selectedUnit.tenantName && (
              <small>{selectedUnit.tenantName}</small>
            )}
          </div>
        ) : onEdit ? (
          <Button onClick={onEdit}>
            <ActionIcon name="edit" />
            Редактировать план
          </Button>
        ) : undefined
      }
    >
      <div className="plan-viewer">
        {plans.length > 1 ? (
          <label>
            План
            <Select
              value={plan.id}
              onChange={(event) => onSelectPlan(event.target.value)}
            >
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {planContextLabel(item, structure)}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <p className="plan-viewer__name">
            {planContextLabel(plan, structure)}
          </p>
        )}
        <div
          className="plan-viewer__toolbar"
          role="group"
          aria-label="Просмотр плана"
        >
          <IconButton label="Увеличить план" onClick={() => zoom(0.8)}>
            <ActionIcon name="zoomIn" />
          </IconButton>
          <IconButton label="Уменьшить план" onClick={() => zoom(1.25)}>
            <ActionIcon name="zoomOut" />
          </IconButton>
          <IconButton
            label="Показать план целиком"
            onClick={() => setView(fit)}
          >
            <ActionIcon name="fit" />
          </IconButton>
          <IconButton
            label="Скачать DXF"
            onClick={() =>
              void downloadDxf(
                `${plan.name.replace(/\.dxf$/i, "")}.dxf`,
                exportDxf(plan.geometry),
              )
            }
          >
            <ActionIcon name="download" />
          </IconButton>
        </div>
        <div className="plan-viewer__canvas">
          <PlanCanvas
            plan={plan}
            imageHeight={imageHeight}
            view={view}
            setView={setView}
            hidden={[]}
            selected={selected}
            select={select}
            tool="pan"
            points={[]}
            addPoint={noop}
            updateGeometry={noop}
            ticketUnits={ticketUnits}
            unitLabels={unitLabels}
            readOnly
            ariaLabel={`План ${plan.name}. Перемещение перетаскиванием, выбор помещения кликом.`}
          />
        </div>
        {selected && !selectedUnit && (
          <div className="plan-viewer__selection">
            <span>
              {plan.isDefault
                ? "Контур здания"
                : shape?.label || shape?.layer || "Контур"}
            </span>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
