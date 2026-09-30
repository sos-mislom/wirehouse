import { z } from "zod";
export const maintenanceImportColumns = {
  key: "Код графика",
  property: "Объект",
  unit: "Помещение",
  building: "Корпус",
  entrance: "Подъезд",
  floor: "Этаж",
  equipment: "Оборудование",
  responsible: "Ответственный",
  name: "Название",
  recurrence: "Периодичность",
  intervalCount: "Интервал",
  nextDate: "Следующая дата",
  endDate: "Окончание",
  leadDays: "За сколько дней",
  checklist: "Чек-лист",
  instructions: "Инструкция",
} as const;
export const maintenanceImportFile = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.(csv|xlsx)$/i),
  contentBase64: z
    .string()
    .min(4)
    .max(2796204)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const maintenanceImportContracts = [
  {
    method: "POST",
    path: /^\/api\/maintenance-import\/preview$/,
    schema: maintenanceImportFile,
  },
  {
    method: "POST",
    path: /^\/api\/maintenance-import\/commit$/,
    schema: maintenanceImportFile.extend({
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  },
];
export type MaintenanceImportFile = z.infer<typeof maintenanceImportFile>;
export type MaintenanceImportRow = {
  row: number;
  key: string;
  name: string;
  property: string;
  unit: string;
  equipment: string;
  responsible: string;
  nextDate: string;
  status: "ready" | "exists" | "error";
  messages: string[];
};
export type MaintenanceImportPreview = {
  previewHash: string;
  summary: { total: number; ready: number; existing: number; errors: number };
  rows: MaintenanceImportRow[];
};
