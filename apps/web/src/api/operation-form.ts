import type { OperationKind } from "../../../../packages/contracts/src/requests.ts";
const fields: Record<OperationKind | "users", readonly string[]> = {
  equipment: [
    "propertyId",
    "name",
    "updatedAt",
    "unitId",
    "responsibleId",
    "type",
    "serialNumber",
    "specifications",
    "warrantyUntil",
    "cost",
    "photoUrl",
    "status",
  ],
  services: [
    "propertyId",
    "name",
    "updatedAt",
    "paid",
    "hourlyRate",
    "basePrice",
    "description",
    "specialty",
    "active",
  ],
  plans: [
    "templateId",
    "templateVersion",
    "recurrence",
    "intervalCount",
    "leadDays",
    "endDate",
    "propertyId",
    "name",
    "updatedAt",
    "unitId",
    "responsibleId",
    "equipmentId",
    "nextDate",
    "checklist",
    "instructions",
    "active",
  ],
  meters: [
    "propertyId",
    "name",
    "updatedAt",
    "unitId",
    "scope",
    "resource",
    "serialNumber",
    "tariff",
    "initialValue",
    "responsibleId",
    "active",
  ],
  news: [
    "propertyId",
    "name",
    "updatedAt",
    "content",
    "tone",
    "audience",
    "published",
    "expiresAt",
  ],
  expenses: ["propertyId", "name", "updatedAt", "amount", "date", "category"],
  floorplans: ["propertyId", "name", "updatedAt", "image", "markers"],
  users: [
    "permissions",
    "fullName",
    "email",
    "password",
    "phone",
    "role",
    "propertyId",
    "specialty",
    "isActive",
  ],
};
const numericFields = new Set([
  "intervalCount",
  "leadDays",
  "cost",
  "hourlyRate",
  "basePrice",
  "tariff",
  "initialValue",
  "amount",
]);
const nullableFields = new Set([
  "templateId",
  "endDate",
  "unitId",
  "responsibleId",
  "equipmentId",
  "warrantyUntil",
  "expiresAt",
  "propertyId",
]);
/** Convert the editable form to its write DTO; server-owned fields never leave the UI. */
export function operationFormDto(kind: string, draft: Record<string, unknown>) {
  const keys = fields[kind as keyof typeof fields];
  if (!keys) throw new Error("Неизвестный тип формы");
  const dto: Record<string, unknown> = {};
  for (const key of keys) {
    let value = draft[key];
    if (value === undefined || (key === "password" && value === "")) continue;
    if (numericFields.has(key))
      value = value === "" ? undefined : Number(value);
    if (nullableFields.has(key) && value === "") value = null;
    if (key === "checklist" && typeof value === "string")
      value = value
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
    dto[key] = value;
  }
  return dto;
}
