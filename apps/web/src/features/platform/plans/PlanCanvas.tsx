import { useRef } from "react";
import type {
  FloorPlan,
  PlanGeometry,
} from "../../../../../../packages/contracts/src/operations-platform";
import type { View } from "./geometry";
type Point = { x: number; y: number };
type Props = {
  imageHeight: number;
  plan: FloorPlan;
  view: View;
  setView: (v: View) => void;
  hidden: string[];
  selected: string;
  select: (id: string) => void;
  tool: string;
  points: Point[];
  addPoint: (p: Point) => void;
  updateGeometry: (g: PlanGeometry) => void;
  ticketUnits: Set<string>;
  unitLabels: Map<string, string>;
};
export function PlanCanvas(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    start: Point;
    view: View;
    vertex?: number;
    shape?: string;
  } | null>(null);
  const point = (event: React.PointerEvent) => {
    const element = svg.current!;
    const ctm = element.getScreenCTM();
    const result = ctm
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          ctm.inverse(),
        )
      : { x: 0, y: 0 };
    return { x: result.x, y: result.y };
  };
  return (
    <svg
      ref={svg}
      className="plan-canvas"
      role="img"
      aria-label="Интерактивный план. Масштаб и инструменты находятся над планом."
      viewBox={`${p.view.x} ${p.view.y} ${p.view.width} ${p.view.height}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (p.tool === "draw") {
          p.addPoint(point(e));
          return;
        }
        if (p.tool === "pan") {
          drag.current = { start: point(e), view: p.view };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const at = point(e),
          d = drag.current;
        if (d.vertex !== undefined && d.shape) {
          p.updateGeometry(
            p.plan.geometry.map((s) =>
              s.id === d.shape
                ? {
                    ...s,
                    points: s.points.map((v, i) =>
                      i === d.vertex ? { x: at.x, y: at.y } : v,
                    ),
                  }
                : s,
            ),
          );
        } else
          p.setView({
            ...p.view,
            x: p.view.x + d.start.x - at.x,
            y: p.view.y + d.start.y - at.y,
          });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {p.plan.image && (
        <image
          href={p.plan.image}
          x="0"
          y="0"
          width="1000"
          height={p.imageHeight}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      {p.plan.geometry
        .filter((s) => !p.hidden.includes(s.layer))
        .map((s) => {
          const active = s.id === p.selected,
            hasTickets = !!s.unitId && p.ticketUnits.has(s.unitId);
          const color = active
            ? "#1e79be"
            : hasTickets
              ? "#a96500"
              : s.equipmentId
                ? "#357c42"
                : "#555";
          const props = {
            key: s.id,
            stroke: color,
            strokeWidth: active ? 2.5 : 1,
            vectorEffect: "non-scaling-stroke" as const,
            onClick: (e: React.MouseEvent) => {
              if (p.tool !== "draw") {
                e.stopPropagation();
                p.select(s.id);
              }
            },
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter") p.select(s.id);
            },
            role: "button",
            "aria-label":
              s.label || p.unitLabels.get(s.unitId ?? "") || s.layer,
          };
          return (
            <g key={s.id}>
              {s.type === "text" ? (
                <text
                  {...props}
                  stroke="none"
                  fill={color}
                  x={s.points[0].x}
                  y={s.points[0].y}
                  fontSize={p.view.width / 70}
                >
                  {s.label}
                </text>
              ) : s.type === "polygon" ? (
                <polygon
                  {...props}
                  points={s.points.map((v) => `${v.x},${v.y}`).join(" ")}
                  fill={
                    active ? "#e4f1fb" : s.unitId ? "#f4f8f4" : "transparent"
                  }
                />
              ) : (
                <polyline
                  {...props}
                  points={s.points.map((v) => `${v.x},${v.y}`).join(" ")}
                  fill="none"
                />
              )}
              {s.unitId && s.type !== "text" && (
                <text
                  x={s.points[0].x}
                  y={s.points[0].y}
                  fontSize={p.view.width / 70}
                  fill={color}
                  pointerEvents="none"
                >
                  {p.unitLabels.get(s.unitId)}
                  {hasTickets ? " · заявка" : ""}
                </text>
              )}
              {active &&
                p.tool === "edit" &&
                s.points.map((v, i) => (
                  <circle
                    key={i}
                    cx={v.x}
                    cy={v.y}
                    r={p.view.width / 140}
                    fill="white"
                    stroke="#1e79be"
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = {
                        start: point(e),
                        view: p.view,
                        vertex: i,
                        shape: s.id,
                      };
                      svg.current!.setPointerCapture(e.pointerId);
                    }}
                  />
                ))}
            </g>
          );
        })}
      {p.plan.markers.map((m) => (
        <g key={m.unitId} onClick={() => p.select(`marker:${m.unitId}`)}>
          <circle
            cx={m.x * 10}
            cy={(m.y * p.imageHeight) / 100}
            r={p.view.width / 100}
            fill="#1e79be"
          />
          <text
            x={m.x * 10 + p.view.width / 80}
            y={(m.y * p.imageHeight) / 100}
            fontSize={p.view.width / 65}
          >
            {p.unitLabels.get(m.unitId)}
          </text>
        </g>
      ))}
      {p.points.length > 0 && (
        <polyline
          points={p.points.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="none"
          stroke="#1e79be"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
