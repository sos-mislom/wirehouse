import ExcelJS from "exceljs";
import { maintenanceImportColumns } from "../../../../packages/contracts/src/maintenance-import.ts";
const maxRows = 2000;
const normalize = (v) =>
  String(v ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");

// Limit expansion before handing the archive to ExcelJS. ZIP64 is unnecessary for a small schedule.
function checkArchive(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length) throw new Error("Поврежденный XLSX");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 500 || offset > end)
    throw new Error("Слишком сложная книга XLSX");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Поврежденный XLSX");
    expanded += buffer.readUInt32LE(offset + 24);
    if (expanded > 32 * 1024 * 1024)
      throw new Error("Распакованный XLSX превышает 32 МБ");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
function csvRows(text) {
  const header = text.split(/\r?\n/, 1)[0];
  const delimiter = header.includes(";")
    ? ";"
    : header.includes("\t")
      ? "\t"
      : ",";
  const rows = [];
  let cells = [],
    cell = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const finishCell = () => {
    cells.push(cell.trim());
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some(Boolean)) rows.push({ row: start, cells });
    cells = [];
    if (rows.length > maxRows + 1)
      throw new Error(`Не больше ${maxRows} строк за одну загрузку`);
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === "\n") line++;
      }
    } else if (char === delimiter) finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
      line++;
      start = line;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed && char.trim())
      throw new Error(`Строка ${line}: текст после закрывающей кавычки`);
    else cell += char;
    if (cells.length > 30 || cell.length > 20000)
      throw new Error("Слишком много колонок или слишком длинная ячейка");
  }
  if (quoted) throw new Error("CSV содержит незакрытую кавычку");
  if (cell || cells.length) finishRow();
  return rows;
}
export async function readMaintenanceSheet({ fileName, contentBase64 }) {
  const buffer = Buffer.from(contentBase64, "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024)
    throw new Error("Файл должен быть от 1 байта до 2 МБ");
  let rows;
  if (/\.csv$/i.test(fileName)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new Error("Сохраните CSV в кодировке UTF-8");
    }
    rows = csvRows(text.replace(/^\uFEFF/, ""));
  } else if (/\.xlsx$/i.test(fileName)) {
    checkArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
    );
    if (workbook.worksheets.length !== 1)
      throw new Error("Оставьте в файле один лист с графиком ППР");
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > maxRows + 1 || sheet.columnCount > 30)
      throw new Error(`Не больше ${maxRows} строк и 30 колонок`);
    rows = [];
    sheet.eachRow((row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, index) => {
        if (
          cell.isMerged ||
          (cell.value &&
            typeof cell.value === "object" &&
            !(cell.value instanceof Date))
        )
          throw new Error(
            `Строка ${row.number}: используйте обычные значения без формул, ссылок и объединенных ячеек`,
          );
        cells[index - 1] =
          cell.value instanceof Date
            ? cell.value.toISOString().slice(0, 10)
            : String(cell.value ?? "").trim();
        if (cells[index - 1].length > 20000)
          throw new Error(`Строка ${row.number}: слишком длинная ячейка`);
      });
      if (cells.some(Boolean)) rows.push({ row: row.number, cells });
    });
  } else throw new Error("Поддерживаются CSV и XLSX");
  if (rows.length < 2)
    throw new Error("Нужны заголовки и хотя бы одна строка графика");
  const aliases = new Map(
    Object.entries(maintenanceImportColumns).flatMap(([key, label]) => [
      [normalize(key), key],
      [normalize(label), key],
    ]),
  );
  const headers = Array.from(rows[0].cells, (v) => {
    const key = aliases.get(normalize(v));
    if (!key)
      throw new Error(`Неизвестная колонка «${v}». Используйте шаблон ППР`);
    return key;
  });
  if (new Set(headers).size !== headers.length)
    throw new Error("Колонки не должны повторяться");
  for (const key of [
    "key",
    "property",
    "unit",
    "name",
    "recurrence",
    "intervalCount",
    "nextDate",
    "checklist",
  ])
    if (!headers.includes(key))
      throw new Error(`Нет колонки «${maintenanceImportColumns[key]}»`);
  return rows.slice(1).map(({ row, cells }) => {
    if (cells.slice(headers.length).some(Boolean))
      throw new Error(`Строка ${row}: данные за пределами заголовков`);
    return {
      row,
      values: Object.fromEntries(
        headers.map((key, i) => [key, cells[i] ?? ""]),
      ),
    };
  });
}
export async function maintenanceImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ППР");
  sheet.addRow(Object.values(maintenanceImportColumns));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    "PPR-001",
    "ID или название объекта",
    "ID или номер помещения",
    "",
    "",
    "",
    "",
    "",
    "Осмотр вентиляции",
    "months",
    1,
    new Date().toISOString().slice(0, 10),
    "",
    0,
    "Осмотреть корпус | Проверить фильтр",
    "",
  ]);
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
