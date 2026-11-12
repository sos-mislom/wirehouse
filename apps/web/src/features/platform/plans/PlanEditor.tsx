import { useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, IconButton, Input, Select } from "../../../ui";
import { WorkspaceTabs } from "../../../ui/WorkspaceTabs";
import { ActionIcon } from "../../business/ActionIcon";
import { isOpenTicket } from "../../../../../../packages/contracts/src/domain.js";
import { downloadDxf } from "./dxf-download";
import { bounds, exportDxf } from "./geometry";
import { PlanCanvas } from "./PlanCanvas";
import { usePlanEditor, type PlanEditorProps } from "./usePlanEditor";
import "./plan-editor.css";
import { planContextLabel } from "./viewer/plan-label";

export function PlanEditor(props: PlanEditorProps) {
  const importInput = useRef<HTMLInputElement>(null);
  const inspectorId = useId();
  const [inspector, setInspector] = useState("plan");
  const {
    plans,
    draft,
    error,
    notice,
    busy,
    dirty,
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
    discard,
    unitOptions,
    shape,
    unitId,
    equipment,
    save,
    importFile,
    patchShape,
    imageHeight,
    loading,
  } = usePlanEditor(props);
  useEffect(() => {
    if (selected) setInspector("element");
  }, [selected]);
  const layers = [...new Set(draft?.geometry.map((item) => item.layer) ?? [])];
  const chosenUnit = props.units.find((item) => item.id === unitId);
  const activeTickets = props.tickets.filter(
    (item) => item.unitId === unitId && isOpenTicket(item.status),
  );
  const level = draft?.floorId
    ? `floor:${draft.floorId}`
    : draft?.buildingId
      ? `building:${draft.buildingId}`
      : "site";
  const finishContour = () => {
    if (!draft || busy || points.length < 3) return;
    const contour = {
      id: crypto.randomUUID(),
      type: "polygon" as const,
      layer: "Помещения",
      points,
    };
    update({ geometry: [...draft.geometry, contour] });
    select(contour.id);
    setPoints([]);
    setTool("edit");
  };
  const cancelDrawing = () => {
    setPoints([]);
    setTool("select");
  };
  const modeLabel =
    tool === "draw"
      ? "Новый контур"
      : tool === "edit"
        ? "Вершины"
        : tool === "pan"
          ? "Перемещение"
          : "Выбор элементов";
  return (
    <div
      className="platform-section plan-editor"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (props.canWrite && dirty && !busy) void save();
        }
        if (event.key === "Escape" && tool === "draw") {
          event.preventDefault();
          cancelDrawing();
        }
      }}
    >
      <div className="plan-selection-toolbar">
        <Select
          aria-label="Выбор плана"
          value={draft?.id ?? ""}
          disabled={dirty || points.length > 0 || busy || loading}
          onChange={(event) => {
            const plan = plans.find((item) => item.id === event.target.value);
            if (plan) open(plan);
          }}
        >
          <option value="">
            {loading
              ? "Загрузка планов…"
              : draft && !draft.id
                ? draft.name
                : "План не выбран"}
          </option>
          {draft?.id && !plans.some((plan) => plan.id === draft.id) && (
            <option value={draft.id}>
              {planContextLabel(draft, props.structure)}
            </option>
          )}
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {planContextLabel(plan, props.structure)}
            </option>
          ))}
        </Select>
        {props.canWrite && (
          <>
            <IconButton
              label="Новый план"
              disabled={dirty || points.length > 0 || busy}
              onClick={() => {
                create();
                setInspector("plan");
              }}
            >
              <ActionIcon name="plus" />
            </IconButton>
            <IconButton
              className="plan-quick-save"
              label="Сохранить план"
              variant="primary"
              disabled={!dirty || busy || points.length > 0}
              onClick={save}
            >
              <ActionIcon name="check" />
            </IconButton>
          </>
        )}
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {notice && !draft && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!draft && !loading && (
        <div className="plan-empty-state">
          <span>Планов пока нет</span>
          {props.canWrite && (
            <Button variant="primary" onClick={create}>
              Создать план
            </Button>
          )}
        </div>
      )}
      {draft && (
        <>
          <div className="plan-toolbar" aria-label="Инструменты плана">
            <div className="plan-tool-group" role="group" aria-label="Масштаб">
              <IconButton
                label="Приблизить"
                onClick={() =>
                  setView({
                    ...view,
                    x: view.x + view.width * 0.1,
                    y: view.y + view.height * 0.1,
                    width: view.width * 0.8,
                    height: view.height * 0.8,
                  })
                }
              >
                <ActionIcon name="zoomIn" />
              </IconButton>
              <IconButton
                label="Отдалить"
                onClick={() =>
                  setView({
                    ...view,
                    x: view.x - view.width * 0.125,
                    y: view.y - view.height * 0.125,
                    width: view.width * 1.25,
                    height: view.height * 1.25,
                  })
                }
              >
                <ActionIcon name="zoomOut" />
              </IconButton>
              <IconButton
                label="Вписать план"
                onClick={() =>
                  setView(bounds(draft.geometry, draft.image, imageHeight))
                }
              >
                <ActionIcon name="fit" />
              </IconButton>
            </div>
            <div
              className="plan-tool-group"
              role="group"
              aria-label="Режим работы"
            >
              <IconButton
                label="Выбрать элемент"
                disabled={points.length > 0}
                aria-pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                <ActionIcon name="list" />
              </IconButton>
              <IconButton
                label="Перемещение"
                disabled={points.length > 0}
                aria-pressed={tool === "pan"}
                onClick={() => setTool("pan")}
              >
                <ActionIcon name="pan" />
              </IconButton>
              {props.canWrite && (
                <>
                  <IconButton
                    label="Нарисовать контур"
                    disabled={busy || points.length > 0}
                    aria-pressed={tool === "draw"}
                    onClick={() => {
                      setTool("draw");
                      setPoints([]);
                    }}
                  >
                    <ActionIcon name="polygon" />
                  </IconButton>
                  <IconButton
                    label="Править вершины"
                    aria-pressed={tool === "edit"}
                    disabled={
                      busy ||
                      points.length > 0 ||
                      !shape ||
                      shape.type === "text"
                    }
                    onClick={() => setTool("edit")}
                  >
                    <ActionIcon name="vertices" />
                  </IconButton>
                </>
              )}
            </div>
            <div
              className="plan-tool-group"
              role="group"
              aria-label="Файлы плана"
            >
              {props.canWrite && (
                <>
                  <IconButton
                    label="Импорт DXF / изображения"
                    disabled={busy || points.length > 0}
                    onClick={() => importInput.current?.click()}
                  >
                    <ActionIcon name="upload" />
                  </IconButton>
                  <Input
                    ref={importInput}
                    aria-label="Импорт DXF / изображения"
                    hidden
                    disabled={busy}
                    type="file"
                    accept=".dxf,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importFile(file);
                      event.target.value = "";
                    }}
                  />
                </>
              )}
              <IconButton
                label="Экспорт DXF"
                disabled={!draft.geometry.length}
                onClick={() =>
                  void downloadDxf(
                    `${draft.name}.dxf`,
                    exportDxf(draft.geometry),
                  )
                }
              >
                <ActionIcon name="download" />
              </IconButton>
            </div>
          </div>
          <div className="plan-mode-row">
            <span className="plan-mode-label">{modeLabel}</span>
            {tool === "draw" ? (
              <>
                <span className="plan-point-count">Точек: {points.length}</span>
                <div className="plan-draw-actions">
                  <IconButton
                    label="Убрать последнюю точку"
                    disabled={busy || !points.length}
                    onClick={() => setPoints((items) => items.slice(0, -1))}
                  >
                    <ActionIcon name="back" />
                  </IconButton>
                  <Button
                    variant="primary"
                    disabled={busy || points.length < 3}
                    onClick={finishContour}
                  >
                    Замкнуть
                  </Button>
                  <IconButton
                    label="Отменить рисование"
                    onClick={cancelDrawing}
                  >
                    <ActionIcon name="close" />
                  </IconButton>
                </div>
              </>
            ) : tool === "edit" && shape ? (
              <span>
                Перетащите вершину или используйте клавиши со стрелками.
              </span>
            ) : null}
          </div>
          <div className="plan-workspace">
            <PlanCanvas
              imageHeight={imageHeight}
              plan={draft}
              view={view}
              setView={setView}
              hidden={hidden}
              selected={selected}
              select={select}
              tool={tool}
              points={points}
              addPoint={(point) => setPoints((items) => [...items, point])}
              updateGeometry={(geometry) => update({ geometry })}
              readOnly={!props.canWrite || busy}
              onCloseContour={finishContour}
              ticketUnits={
                new Set(
                  props.tickets
                    .filter((item) => isOpenTicket(item.status))
                    .map((item) => item.unitId),
                )
              }
              unitLabels={
                new Map(props.units.map((item) => [item.id, item.number]))
              }
            />
            <aside className="plan-inspector" aria-label="Параметры плана">
              <WorkspaceTabs
                idPrefix={inspectorId}
                label="Параметры плана"
                items={[
                  { id: "plan", label: "План" },
                  { id: "element", label: "Элемент" },
                  { id: "layers", label: "Слои", count: layers.length },
                ]}
                value={inspector}
                onChange={setInspector}
              />
              {inspector === "plan" && (
                <div
                  className="plan-inspector-fields"
                  role="tabpanel"
                  id={`${inspectorId}-panel-plan`}
                  aria-labelledby={`${inspectorId}-tab-plan`}
                >
                  <label>
                    Название
                    <Input
                      required
                      maxLength={300}
                      disabled={!props.canWrite || busy}
                      value={draft.name}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </label>
                  <label>
                    Расположение
                    <Select
                      disabled={!props.canWrite || busy}
                      value={level}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "site")
                          update({
                            kind: "site",
                            floorId: null,
                            buildingId: null,
                          });
                        else if (value.startsWith("building:"))
                          update({
                            kind: "building",
                            floorId: null,
                            buildingId: value.slice(9),
                          });
                        else {
                          const floor = props.structure.floors.find(
                            (item) => item.id === value.slice(6),
                          );
                          const entrance = props.structure.entrances.find(
                            (item) => item.id === floor?.entranceId,
                          );
                          update({
                            kind: "floor",
                            floorId: floor?.id ?? null,
                            buildingId: entrance?.buildingId ?? null,
                          });
                        }
                      }}
                    >
                      <option value="site">Генеральный план</option>
                      {props.structure.buildings
                        .filter((item) => item.propertyId === props.propertyId)
                        .map((item) => (
                          <option key={item.id} value={`building:${item.id}`}>
                            Корпус {item.name}
                          </option>
                        ))}
                      {props.structure.floors
                        .filter((item) => item.propertyId === props.propertyId)
                        .map((floor) => {
                          const entrance = props.structure.entrances.find(
                            (item) => item.id === floor.entranceId,
                          );
                          const building = props.structure.buildings.find(
                            (item) => item.id === entrance?.buildingId,
                          );
                          return (
                            <option key={floor.id} value={`floor:${floor.id}`}>
                              {floor.name} · {building?.name} / {entrance?.name}
                            </option>
                          );
                        })}
                    </Select>
                  </label>
                  <span className="plan-inspector-summary">
                    Элементов: {draft.geometry.length}
                  </span>
                </div>
              )}
              {inspector === "layers" && (
                <div
                  className="plan-layer-list"
                  role="tabpanel"
                  id={`${inspectorId}-panel-layers`}
                  aria-labelledby={`${inspectorId}-tab-layers`}
                >
                  {layers.map((layer) => (
                    <Checkbox
                      key={layer}
                      checked={!hidden.includes(layer)}
                      onChange={(event) =>
                        setHidden((items) =>
                          event.target.checked
                            ? items.filter((item) => item !== layer)
                            : [...items, layer],
                        )
                      }
                    >
                      {layer}
                    </Checkbox>
                  ))}
                  {!layers.length && (
                    <p className="plan-inspector-empty">
                      Слои появятся после добавления контура или импорта.
                    </p>
                  )}
                </div>
              )}
              {inspector === "element" && (
                <div
                  className="plan-inspector-fields"
                  role="tabpanel"
                  id={`${inspectorId}-panel-element`}
                  aria-labelledby={`${inspectorId}-tab-element`}
                >
                  {shape ? (
                    <>
                      <label>
                        Название элемента
                        <Input
                          disabled={!props.canWrite || busy}
                          value={shape.label ?? ""}
                          placeholder="Контур"
                          onChange={(event) =>
                            patchShape({ label: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Помещение
                        <Select
                          aria-label="Помещение на плане"
                          disabled={!props.canWrite || busy}
                          value={shape.unitId ?? ""}
                          onChange={(event) =>
                            patchShape({
                              unitId: event.target.value || null,
                              equipmentId: null,
                            })
                          }
                        >
                          <option value="">Без привязки</option>
                          {unitOptions.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.number} ·{" "}
                              {unit.tenantName ?? "Без арендатора"}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Оборудование
                        <Select
                          disabled={!props.canWrite || busy}
                          value={shape.equipmentId ?? ""}
                          onChange={(event) => {
                            const item = equipment.find(
                              (item) => item.id === event.target.value,
                            );
                            patchShape({
                              equipmentId: item?.id ?? null,
                              ...(item ? { unitId: item.unitId } : {}),
                            });
                          }}
                        >
                          <option value="">Без привязки</option>
                          {equipment
                            .filter(
                              (item) =>
                                !shape.unitId || item.unitId === shape.unitId,
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </Select>
                      </label>
                      {props.canWrite && (
                        <IconButton
                          label="Удалить элемент"
                          disabled={busy}
                          variant="danger"
                          onClick={() => {
                            update({
                              geometry: draft.geometry.filter(
                                (item) => item.id !== selected,
                              ),
                            });
                            select("");
                            setTool("select");
                          }}
                        >
                          <ActionIcon name="delete" />
                        </IconButton>
                      )}
                    </>
                  ) : !unitId ? (
                    <p className="plan-inspector-empty">
                      Нажмите на контур или метку помещения.
                    </p>
                  ) : null}
                  {unitId && (
                    <>
                      <Button onClick={() => props.onUnit(unitId)}>
                        Помещение {chosenUnit?.number ?? ""}
                      </Button>
                      {activeTickets.length > 0 && (
                        <div className="plan-ticket-links">
                          <h4>Открытые заявки</h4>
                          {activeTickets.map((ticket) =>
                            props.onTicket ? (
                              <Button
                                key={ticket.id}
                                variant="text"
                                onClick={() => props.onTicket?.(ticket.id)}
                              >
                                {ticket.number} · {ticket.title}
                              </Button>
                            ) : (
                              <span key={ticket.id}>
                                {ticket.number} · {ticket.title}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </aside>
          </div>
          {props.canWrite && (
            <div className="plan-savebar">
              <span
                role={notice ? "status" : undefined}
                tabIndex={notice ? 0 : undefined}
              >
                {(points.length > 0
                  ? "Завершите контур или отмените рисование"
                  : notice) ||
                  (dirty
                    ? "Изменения не сохранены"
                    : "Все изменения сохранены")}
              </span>
              <div className="ui-actions">
                {(dirty || points.length > 0) && (
                  <Button disabled={busy} onClick={discard}>
                    Отменить
                  </Button>
                )}
                <Button
                  title="Сохранить план · Ctrl+S"
                  variant="primary"
                  busy={busy}
                  disabled={!dirty || points.length > 0}
                  onClick={save}
                >
                  Сохранить план
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
