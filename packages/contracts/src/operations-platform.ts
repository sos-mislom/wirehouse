import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const name = z.string().trim().min(1).max(300);
const text = z.string().trim().max(10000);
const number = z.number().finite().min(0).max(1e9);
const stamp = { updatedAt: z.iso.datetime({ offset: true }).optional() };
const base = { propertyId: id, name, ...stamp };
export const structureSchemas = {
  buildings: z.strictObject(base),
  entrances: z.strictObject({ ...base, buildingId: id }),
  floors: z.strictObject({
    ...base,
    entranceId: id,
    number: z.number().int().min(-10).max(300),
  }),
};
export const catalogSchemas = {
  templates: z.strictObject({
    ...base,
    instructions: text,
    checklist: z.array(name).min(1).max(100),
  }),
  materials: z.strictObject({
    ...base,
    unit: name,
    price: number,
    active: z.boolean(),
  }),
  contractors: z.strictObject({
    ...base,
    inn: z.string().regex(/^(\d{10}|\d{12})$/),
    contact: text,
    active: z.boolean(),
  }),
};
export const planPoint = z.strictObject({
  x: z.number().finite().min(-1e9).max(1e9),
  y: z.number().finite().min(-1e9).max(1e9),
});
export const planGeometry = z
  .array(
    z.strictObject({
      id,
      layer: name,
      type: z.enum(["polyline", "polygon", "text"]),
      points: z.array(planPoint).min(1).max(2000),
      label: text.optional(),
      unitId: id.nullable().optional(),
      equipmentId: id.nullable().optional(),
    }),
  )
  .max(15000)
  .refine(
    (shapes) =>
      shapes.reduce((count, shape) => count + shape.points.length, 0) <= 100000,
    "Максимум 100 000 вершин на плане",
  );
export type PlanGeometry = z.infer<typeof planGeometry>;
export const estimateCreate = z.strictObject({
  propertyId: id,
  ticketId: id,
  name,
  contractorId: id.nullable(),
  version: z.number().int().min(0),
  lines: z
    .array(
      z.strictObject({
        kind: z.enum(["labor", "material", "service"]),
        catalogId: id.nullable(),
        description: name,
        unit: name,
        quantity: number.positive().max(1e6),
        unitPrice: number.max(1e7),
        vatRate: z.enum(["0", "5", "7", "10", "20", "22"]),
      }),
    )
    .min(1)
    .max(200),
});
export type EstimateInput = z.infer<typeof estimateCreate>;
export const platformContracts = [
  ...Object.entries(structureSchemas).flatMap(([kind, schema]) => [
    { method: "POST", path: new RegExp(`^/api/structure/${kind}$`), schema },
    {
      method: "PUT",
      path: new RegExp(`^/api/structure/${kind}/[a-zA-Z0-9-]+$`),
      schema,
    },
  ]),
  ...Object.entries(catalogSchemas).flatMap(([kind, schema]) => [
    { method: "POST", path: new RegExp(`^/api/maintenance/${kind}$`), schema },
    {
      method: "PUT",
      path: new RegExp(`^/api/maintenance/${kind}/[a-zA-Z0-9-]+$`),
      schema,
    },
  ]),
  { method: "POST", path: /^\/api\/estimates$/, schema: estimateCreate },
  {
    method: "PUT",
    path: /^\/api\/estimates\/[a-zA-Z0-9-]+$/,
    schema: estimateCreate,
  },
  {
    method: "POST",
    path: /^\/api\/estimates\/[a-zA-Z0-9-]+\/(submit|approve|reject|act)$/,
    schema: z.strictObject({
      version: z.number().int().positive(),
      reason: text.optional(),
    }),
  },
  {
    method: "POST",
    path: /^\/api\/operations\/floorplans\/import-dxf$/,
    schema: z.strictObject({
      content: z
        .string()
        .min(1)
        .max(8 * 1024 * 1024),
    }),
  },
];
export type Building = {
  id: string;
  propertyId: string;
  name: string;
  updatedAt: string;
};
export type Entrance = Building & { buildingId: string };
export type Floor = Building & { entranceId: string; number: number };
export type Structure = {
  buildings: Building[];
  entrances: Entrance[];
  floors: Floor[];
};
export type FloorPlan = {
  id: string;
  propertyId: string;
  name: string;
  floorId: string | null;
  kind: "site" | "floor";
  image: string;
  geometry: PlanGeometry;
  layers: string[];
  version: number;
  updatedAt: string;
  markers: { unitId: string; x: number; y: number }[];
  sourceName: string;
};
export type CatalogItem = {
  id: string;
  propertyId: string;
  name: string;
  updatedAt: string;
  version?: number;
  instructions?: string;
  checklist?: string[];
  unit?: string;
  price?: number;
  inn?: string;
  contact?: string;
  active?: boolean;
};
export type Estimate = Omit<EstimateInput, "lines"> & {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "acted";
  lines: (EstimateInput["lines"][number] & {
    net: number;
    vat: number;
    total: number;
  })[];
  total: number;
  rejectionReason: string;
  updatedAt: string;
};
export type ServiceAct = {
  id: string;
  estimateId: string;
  number: string;
  date: string;
  total: number;
  snapshot: {
    name: string;
    ticketNumber: string;
    tenantName: string;
    propertyName: string;
    contractorName: string;
    lines: Estimate["lines"];
    total: number;
  };
};
