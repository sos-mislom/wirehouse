import type { PlanGeometry } from "../../../../../../packages/contracts/src/operations-platform";
export type View = { x: number; y: number; width: number; height: number };
export function bounds(
  geometry: PlanGeometry,
  image: string,
  imageHeight = 700,
): View {
  const points = geometry.flatMap((s) => s.points);
  if (image) points.push({ x: 0, y: 0 }, { x: 1000, y: imageHeight });
  if (!points.length) return { x: 0, y: 0, width: 1000, height: 700 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = Math.max(1, Math.max(maxX - minX, maxY - minY) * 0.04);
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(10, maxX - minX + pad * 2),
    height: Math.max(10, maxY - minY + pad * 2),
  };
}
export function exportDxf(geometry: PlanGeometry) {
  const rows = ["0", "SECTION", "2", "ENTITIES"];
  for (const s of geometry) {
    if (s.type === "text") {
      rows.push(
        "0",
        "TEXT",
        "8",
        s.layer,
        "10",
        String(s.points[0].x),
        "20",
        String(-s.points[0].y),
        "40",
        "10",
        "1",
        (s.label ?? "").replace(/[\r\n]/g, " "),
      );
      continue;
    }
    rows.push(
      "0",
      "LWPOLYLINE",
      "8",
      s.layer,
      "90",
      String(s.points.length),
      "70",
      s.type === "polygon" ? "1" : "0",
    );
    for (const p of s.points) rows.push("10", String(p.x), "20", String(-p.y));
  }
  rows.push("0", "ENDSEC", "0", "EOF");
  return rows.join("\n");
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/dxf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
