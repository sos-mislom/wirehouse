import crypto from "node:crypto";
import DxfParser from "dxf-parser";
import { planGeometry } from "../../../../packages/contracts/src/operations-platform.ts";

export function importDxf(content) {
  if (!content.includes("SECTION") || content.startsWith("AutoCAD Binary"))
    throw new Error(
      "Нужен текстовый DXF. Экспортируйте DWG в DXF в вашей CAD-программе.",
    );
  let drawing;
  const pairs = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rawTypes = [];
  for (let i = 0; i + 1 < pairs.length; i += 2)
    if (pairs[i].trim() === "0") rawTypes.push(pairs[i + 1].trim());
  if (rawTypes.length > 20000)
    throw new Error(
      "DXF слишком сложный: сократите чертёж до 15 000 элементов",
    );
  try {
    drawing = new DxfParser().parseSync(content);
  } catch {
    throw new Error(
      "Не удалось прочитать DXF. Проверьте файл в CAD-программе.",
    );
  }
  const shapes = [],
    skipped = new Map();
  const parsedTypes = new Set([
    "LINE",
    "LWPOLYLINE",
    "POLYLINE",
    "INSERT",
    "CIRCLE",
    "ARC",
    "TEXT",
    "MTEXT",
    "POINT",
    "ELLIPSE",
    "SPLINE",
    "SOLID",
    "3DFACE",
    "DIMENSION",
    "ATTDEF",
  ]);
  const structuralTypes = new Set([
    "SECTION",
    "ENDSEC",
    "EOF",
    "TABLE",
    "ENDTAB",
    "BLOCK",
    "ENDBLK",
    "VERTEX",
    "SEQEND",
    "LAYER",
    "LTYPE",
    "STYLE",
    "VIEW",
    "VPORT",
    "UCS",
    "APPID",
    "DIMSTYLE",
    "BLOCK_RECORD",
    "DICTIONARY",
    "ACDBDICTIONARYWDFLT",
    "ACDBPLACEHOLDER",
    "LAYOUT",
    "XRECORD",
  ]);
  for (const type of rawTypes)
    if (!parsedTypes.has(type) && !structuralTypes.has(type))
      skipped.set(type, (skipped.get(type) ?? 0) + 1);
  const skip = (type) => skipped.set(type, (skipped.get(type) ?? 0) + 1);
  const sampleArc = (center, radius, start, sweep) =>
    Array.from({ length: 65 }, (_, i) => ({
      x: center.x + radius * Math.cos(start + (sweep * i) / 64),
      y: center.y + radius * Math.sin(start + (sweep * i) / 64),
    }));
  let visited = 0;
  function visit(
    entity,
    transform = (p) => p,
    depth = 0,
    inheritedLayer = "0",
  ) {
    if (++visited > 15000 || depth > 12)
      throw new Error(
        "DXF слишком сложный: максимум 15 000 элементов и 12 уровней блоков",
      );
    const layer =
      entity.layer && entity.layer !== "0" ? entity.layer : inheritedLayer;
    if (entity.type === "INSERT") {
      const block = drawing.blocks?.[entity.name];
      if (
        !block ||
        (entity.rowCount ?? 1) > 1 ||
        (entity.columnCount ?? 1) > 1
      ) {
        skip("INSERT (массив или отсутствующий блок)");
        return;
      }
      const angle = ((entity.rotation ?? 0) * Math.PI) / 180;
      for (const child of block.entities ?? [])
        visit(
          child,
          (p) => {
            const x = (p.x - (block.position?.x ?? 0)) * (entity.xScale ?? 1),
              y = (p.y - (block.position?.y ?? 0)) * (entity.yScale ?? 1);
            return transform({
              x: entity.position.x + x * Math.cos(angle) - y * Math.sin(angle),
              y: entity.position.y + x * Math.sin(angle) + y * Math.cos(angle),
            });
          },
          depth + 1,
          layer,
        );
      return;
    }
    let points,
      type = "polyline",
      label;
    if (["LINE", "LWPOLYLINE", "POLYLINE"].includes(entity.type)) {
      points = [];
      const vertices = entity.vertices ?? [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % vertices.length];
        points.push(a);
        if (a.bulge && (i < vertices.length - 1 || entity.shape)) {
          const length = Math.hypot(b.x - a.x, b.y - a.y),
            sweep = 4 * Math.atan(a.bulge);
          const h = (length * (1 - a.bulge * a.bulge)) / (4 * a.bulge);
          const center = {
            x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * h,
            y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * h,
          };
          points.push(
            ...sampleArc(
              center,
              Math.hypot(a.x - center.x, a.y - center.y),
              Math.atan2(a.y - center.y, a.x - center.x),
              sweep,
            ).slice(1, -1),
          );
        }
      }
      if (entity.shape) type = "polygon";
    } else if (entity.type === "CIRCLE" || entity.type === "ARC") {
      let sweep =
        entity.type === "CIRCLE"
          ? Math.PI * 2
          : entity.endAngle - entity.startAngle;
      if (sweep <= 0) sweep += Math.PI * 2;
      points = sampleArc(
        entity.center,
        entity.radius,
        entity.startAngle ?? 0,
        sweep,
      );
      if (entity.type === "CIRCLE") type = "polygon";
    } else if (entity.type === "TEXT" || entity.type === "MTEXT") {
      points = [entity.startPoint ?? entity.position];
      type = "text";
      label = String(entity.text ?? "").replace(/\\P/g, " ");
    } else {
      skip(entity.type);
      return;
    }
    if (points.length < (type === "text" ? 1 : 2)) {
      skip(entity.type);
      return;
    }
    shapes.push({
      id: crypto.randomUUID(),
      type,
      layer,
      points: points.map((p) => {
        const v = transform(p);
        return { x: v.x, y: -v.y };
      }),
      ...(label ? { label } : {}),
    });
  }
  for (const entity of drawing.entities ?? []) visit(entity);
  if (!shapes.length)
    throw new Error("DXF не содержит поддерживаемой 2D-геометрии");
  const geometry = planGeometry.parse(shapes);
  return {
    geometry,
    layers: [...new Set(geometry.map((s) => s.layer))],
    warnings: [...skipped].map(
      ([type, count]) => `${type}: пропущено ${count}`,
    ),
    sourceUnits: drawing.header?.$INSUNITS ?? 0,
  };
}
