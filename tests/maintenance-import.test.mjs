import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { fixture } from "./fixtures.mjs";
import {
  prepareMaintenanceImport,
  commitMaintenanceImport,
} from "../apps/api/src/services/maintenance-import.js";
import {
  readMaintenanceSheet,
  maintenanceImportTemplate,
} from "../apps/api/src/services/maintenance-sheet.js";
import { saveOperation, runMaintenance } from "../apps/api/src/operations.js";
import { maintenanceImportColumns } from "../packages/contracts/src/maintenance-import.ts";
import { scheduleFile } from "./maintenance-fixtures.mjs";
test("PPR preview is read-only, import is atomic, repeated keys preserve manual edits and issued task history", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const input = scheduleFile(f);
  const before = structuredClone(f.db.data);
  const { preview } = await prepareMaintenanceImport(f.db, f.manager, input);
  assert.deepEqual(preview.summary, {
    total: 1,
    ready: 1,
    existing: 0,
    errors: 0,
  });
  assert.deepEqual(f.db.data, before);
  const result = await commitMaintenanceImport(f.db, f.manager, {
    ...input,
    previewHash: preview.previewHash,
  });
  assert.equal(result.created, 1);
  const plan = f.db.getById("maintenance_plans", result.ids[0]);
  assert.equal(plan.importKey, "PPR-001");
  assert.equal(runMaintenance(f.db, "2030-01-31").length, 1);
  const task = structuredClone(f.db.data.tickets[0]);
  saveOperation(f.db, f.manager, "plans", plan.id, {
    name: "Исправлено инженером",
  });
  const repeated = await prepareMaintenanceImport(f.db, f.manager, input);
  assert.equal(repeated.preview.summary.existing, 1);
  assert.equal(
    (
      await commitMaintenanceImport(f.db, f.manager, {
        ...input,
        previewHash: repeated.preview.previewHash,
      })
    ).created,
    0,
  );
  assert.equal(f.db.data.maintenance_plans.length, 1);
  assert.equal(
    f.db.getById("maintenance_plans", plan.id).name,
    "Исправлено инженером",
  );
  assert.deepEqual(f.db.data.tickets[0], task);
});
test("PPR does not guess ambiguous locations or import a partly invalid file", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.db.createUnit({
    propertyId: f.property.id,
    number: "101",
    floor: 2,
    building: "Б",
    entrance: "1",
    area: 20,
    type: "office",
    status: "vacant",
  });
  const input = scheduleFile(f, {
    unit: "101",
    extraRows: [
      [
        "PPR-002",
        f.property.id,
        f.unit.id,
        "Осмотр",
        "days",
        "1",
        "2030-01-01",
        "Проверить",
      ],
    ],
  });
  const { preview } = await prepareMaintenanceImport(f.db, f.manager, input);
  assert.equal(preview.summary.errors, 1);
  assert.equal(preview.summary.ready, 1);
  assert.match(preview.rows[0].messages[0], /несколько совпадений/);
  await assert.rejects(
    commitMaintenanceImport(f.db, f.manager, {
      ...input,
      previewHash: preview.previewHash,
    }),
    /Исправьте все ошибки/,
  );
  assert.equal(f.db.data.maintenance_plans.length, 0);
});
test("PPR requires both permissions, scoped references, unique file keys and an unchanged preview", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  for (const permissions of [["imports.write"], ["maintenance.write"]])
    await assert.rejects(
      prepareMaintenanceImport(
        f.db,
        { ...f.manager, permissions },
        scheduleFile(f),
      ),
      /Нет права/,
    );
  const foreign = await prepareMaintenanceImport(
    f.db,
    f.manager,
    scheduleFile(f, { property: f.other.id, unit: f.otherUnit.id }),
  );
  assert.equal(foreign.preview.summary.errors, 1);
  const duplicate = scheduleFile(f, {
    extraRows: [
      [
        "PPR-001",
        f.property.id,
        f.unit.id,
        "Другой",
        "days",
        "1",
        "2030-01-01",
        "Проверить",
      ],
    ],
  });
  assert.equal(
    (await prepareMaintenanceImport(f.db, f.manager, duplicate)).preview.summary
      .errors,
    2,
  );
  const input = scheduleFile(f, { unit: "101" });
  const { preview } = await prepareMaintenanceImport(f.db, f.manager, input);
  f.db.updateUnit(f.unit.id, { number: "102" });
  await assert.rejects(
    commitMaintenanceImport(f.db, f.manager, {
      ...input,
      previewHash: preview.previewHash,
    }),
    /изменились/,
  );
  assert.equal(f.db.data.maintenance_plans.length, 0);
});
test("CSV preserves quoted multiline checklists and rejects malformed quoting, dates and unknown columns", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const input = scheduleFile(f);
  const csv = Buffer.from(input.contentBase64, "base64")
    .toString()
    .replace("Осмотреть|Проверить", "Осмотреть\nПроверить");
  const multiline = {
    ...input,
    contentBase64: Buffer.from(csv).toString("base64"),
  };
  const p = await prepareMaintenanceImport(f.db, f.admin, multiline);
  assert.equal(p.prepared[0].payload.checklist.length, 2);
  await assert.rejects(
    readMaintenanceSheet({
      ...input,
      contentBase64: Buffer.from(csv + '"').toString("base64"),
    }),
    /кавычк/,
  );
  const badDate = await prepareMaintenanceImport(
    f.db,
    f.admin,
    scheduleFile(f, { day: "2030-02-31" }),
  );
  assert.equal(badDate.preview.summary.errors, 1);
  await assert.rejects(
    readMaintenanceSheet({
      ...input,
      contentBase64: Buffer.from(
        csv.replace("Код графика", "Непонятная колонка"),
      ).toString("base64"),
    }),
    /Неизвестная колонка/,
  );
});
test("Excel template supports actual Excel dates and refuses formulas and ambiguous sheets", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await maintenanceImportTemplate());
  const sheet = workbook.worksheets[0];
  const col = (key) => Object.keys(maintenanceImportColumns).indexOf(key) + 1;
  sheet.getRow(2).getCell(col("property")).value = f.property.id;
  sheet.getRow(2).getCell(col("unit")).value = f.unit.id;
  sheet.getRow(2).getCell(col("nextDate")).value = new Date(
    "2030-01-31T00:00:00Z",
  );
  const input = async () => ({
    fileName: "schedule.xlsx",
    contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString(
      "base64",
    ),
  });
  const { preview } = await prepareMaintenanceImport(
    f.db,
    f.admin,
    await input(),
  );
  assert.equal(preview.summary.ready, 1);
  assert.equal(preview.rows[0].nextDate, "2030-01-31");
  sheet.getRow(2).getCell(col("intervalCount")).value = {
    formula: "1+1",
    result: 2,
  };
  await assert.rejects(readMaintenanceSheet(await input()), /без формул/);
  workbook.addWorksheet("Другие данные");
  await assert.rejects(readMaintenanceSheet(await input()), /один лист/);
});

test("PPR reports ambiguous equipment and accepts its explicit identifier", async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const equipment = [1, 2].map((i) =>
    saveOperation(f.db, f.admin, "equipment", null, {
      propertyId: f.property.id,
      unitId: f.unit.id,
      name: "Вентиляция",
      type: "Вентустановка",
      serialNumber: String(i),
    }),
  );
  const input = scheduleFile(f);
  const csv = Buffer.from(input.contentBase64, "base64")
    .toString()
    .split("\r\n");
  csv[0] += ';"Оборудование"';
  csv[1] += ';"Вентиляция"';
  const ambiguous = {
    ...input,
    contentBase64: Buffer.from(csv.join("\r\n")).toString("base64"),
  };
  const result = await prepareMaintenanceImport(f.db, f.admin, ambiguous);
  assert.equal(result.preview.summary.errors, 1);
  assert.match(
    result.preview.rows[0].messages[0],
    /Оборудование: несколько совпадений/,
  );
  csv[1] = csv[1].replace(';"Вентиляция"', ';"' + equipment[0].id + '"');
  assert.equal(
    (
      await prepareMaintenanceImport(f.db, f.admin, {
        ...input,
        contentBase64: Buffer.from(csv.join("\r\n")).toString("base64"),
      })
    ).preview.summary.ready,
    1,
  );
});
