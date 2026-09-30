import crypto from "node:crypto";
import { WarehouseDatabase } from "../database.js";
import { operationsScope, saveOperation } from "../operations.js";
import { assertPermission } from "./permissions.js";
import { operationSchemas } from "../../../../packages/contracts/src/requests.ts";
import { parseDto } from "../http/body.js";
import { readMaintenanceSheet } from "./maintenance-sheet.js";
const normal = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru");
function resolve(items, value, selectors, label) {
  if (!value) throw new Error(`${label}: укажите значение`);
  const exact = items.find((item) => item.id === value);
  const matches = exact
    ? [exact]
    : items.filter((item) =>
        selectors.some((fn) => normal(fn(item)) === normal(value)),
      );
  if (!matches.length)
    throw new Error(`${label}: запись не найдена в доступной области`);
  if (matches.length > 1)
    throw new Error(
      `${label}: несколько совпадений; укажите ID${label === "Помещение" ? " или уточните корпус, подъезд и этаж" : ""}`,
    );
  return matches[0];
}
const recurrenceNames = {
  дни: "days",
  недели: "weeks",
  месяцы: "months",
  годы: "years",
  days: "days",
  weeks: "weeks",
  months: "months",
  years: "years",
};
function date(value) {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(value)
    ? value.split(".").reverse().join("-")
    : value;
}
function integer(value, label) {
  if (!/^\d+$/.test(value))
    throw new Error(`${label}: укажите целое неотрицательное число`);
  return Number(value);
}
function access(actor) {
  assertPermission(actor, "maintenance.write");
  assertPermission(actor, "imports.write");
  if (!["admin", "manager"].includes(actor.role))
    throw Object.assign(new Error("Импорт доступен сотрудникам управления"), {
      status: 403,
    });
}
export async function prepareMaintenanceImport(db, actor, input) {
  access(actor);
  const sourceRows = await readMaintenanceSheet(input);
  const scope = operationsScope(db, actor);
  const properties = db.data.properties.filter((p) => scope(p.id));
  const sandbox = new WarehouseDatabase(db.data);
  const prepared = [],
    rows = [],
    seen = new Map();
  sandbox.transaction(() => {
    for (const { row, values: v } of sourceRows) {
      const result = {
        row,
        key: v.key,
        name: v.name,
        property: v.property,
        unit: v.unit,
        equipment: v.equipment ?? "",
        responsible: v.responsible ?? "",
        nextDate: v.nextDate,
        status: "ready",
        messages: [],
      };
      rows.push(result);
      try {
        if (!v.key.trim() || v.key.length > 120)
          throw new Error("Код графика: от 1 до 120 символов");
        const property = resolve(
          properties,
          v.property,
          [(p) => p.name],
          "Объект",
        );
        const unique = JSON.stringify([property.id, v.key]);
        if (seen.has(unique)) {
          const previous = seen.get(unique);
          previous.status = "error";
          previous.messages.push(`Код повторяется в строке ${row}`);
          throw new Error(`Код повторяется в строке ${previous.row}`);
        }
        seen.set(unique, result);
        result.property = property.name;
        const existing = db.data.maintenance_plans.find(
          (p) => p.propertyId === property.id && p.importKey === v.key,
        );
        if (existing) {
          result.status = "exists";
          result.messages.push(
            "Уже загружен. Правки выполняются в карточке графика; повторная загрузка их не заменяет.",
          );
          prepared.push({
            key: v.key,
            propertyId: property.id,
            existingId: existing.id,
            updatedAt: existing.updatedAt,
          });
          continue;
        }
        const units = db.data.units.filter(
          (u) =>
            u.property_id === property.id &&
            (!v.building || normal(u.building) === normal(v.building)) &&
            (!v.entrance || normal(u.entrance) === normal(v.entrance)) &&
            (!v.floor || String(u.floor) === v.floor),
        );
        const unit = resolve(units, v.unit, [(u) => u.number], "Помещение");
        const equipment = v.equipment
          ? resolve(
              db.data.equipment.filter(
                (e) =>
                  e.propertyId === property.id &&
                  e.unitId === unit.id &&
                  e.status !== "retired",
              ),
              v.equipment,
              [(e) => e.name, (e) => e.serialNumber],
              "Оборудование",
            )
          : null;
        const responsible = v.responsible
          ? resolve(
              db.data.users.filter(
                (u) =>
                  u.is_active &&
                  u.role !== "tenant" &&
                  (!u.property_id || u.property_id === property.id),
              ),
              v.responsible,
              [(u) => u.full_name, (u) => u.email],
              "Ответственный",
            )
          : null;
        const payload = parseDto(operationSchemas.plans, {
          name: v.name,
          propertyId: property.id,
          unitId: unit.id,
          equipmentId: equipment?.id ?? null,
          responsibleId: responsible?.id ?? null,
          recurrence: recurrenceNames[normal(v.recurrence)],
          intervalCount: integer(v.intervalCount, "Интервал"),
          nextDate: date(v.nextDate),
          endDate: v.endDate ? date(v.endDate) : null,
          leadDays: v.leadDays ? integer(v.leadDays, "За сколько дней") : 0,
          checklist: v.checklist
            .split(/\r?\n|\|/)
            .map((s) => s.trim())
            .filter(Boolean),
          instructions: v.instructions ?? "",
          active: true,
        });
        saveOperation(sandbox, actor, "plans", null, payload);
        result.unit = `${unit.building || "Без корпуса"} / ${unit.entrance || "Без подъезда"} / этаж ${unit.floor} / ${unit.number}`;
        result.equipment = equipment?.name ?? "Не задано";
        result.responsible = responsible?.full_name ?? "Не назначен";
        result.nextDate = payload.nextDate;
        if (payload.nextDate < new Date().toISOString().slice(0, 10))
          result.messages.push(
            "Дата в прошлом: после загрузки генератор создаст пропущенные задания.",
          );
        if (!responsible)
          result.messages.push("Назначьте ответственного в карточке графика.");
        prepared.push({ key: v.key, payload });
      } catch (error) {
        result.status = "error";
        result.messages.push(
          error.fields?.map((f) => `${f.path}: ${f.message}`).join("; ") ||
            error.message,
        );
      }
    }
  });
  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    existing: rows.filter((r) => r.status === "exists").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
  const previewHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        actorId: actor.id,
        file: input.contentBase64,
        prepared,
        rows,
      }),
    )
    .digest("hex");
  return { preview: { previewHash, summary, rows }, prepared };
}
export async function commitMaintenanceImport(db, actor, input) {
  const { preview, prepared } = await prepareMaintenanceImport(
    db,
    actor,
    input,
  );
  if (preview.previewHash !== input.previewHash)
    throw Object.assign(
      new Error(
        "Файл или связанные данные изменились. Повторите проверку файла.",
      ),
      { status: 409 },
    );
  if (preview.summary.errors)
    throw Object.assign(
      new Error(
        "Исправьте все ошибки файла перед загрузкой. Ни один график не создан.",
      ),
      { status: 422 },
    );
  return db.transaction(() => {
    const ids = [];
    for (const row of prepared) {
      if (row.existingId) continue;
      const plan = saveOperation(db, actor, "plans", null, row.payload);
      db.getById("maintenance_plans", plan.id).importKey = row.key;
      ids.push(plan.id);
    }
    return { created: ids.length, existing: preview.summary.existing, ids };
  });
}
