import ExcelJS from "exceljs";
import path from "node:path";
export function createSpreadsheetService({}) {
  const excelXmlEscape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const excelSheetName = (value) => excelXmlEscape(String(value).slice(0, 31));

  const excelCell = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${excelXmlEscape(value)}</Data></Cell>`;
  };

  const excelRow = (values, styleId = null) =>
    `<Row>${values.map((value) => (styleId ? `<Cell ss:StyleID="${styleId}">${excelCell(value).replace(/^<Cell>|<\/Cell>$/g, "")}</Cell>` : excelCell(value))).join("")}</Row>`;

  const tableRows = (headers, rows) =>
    [
      excelRow(
        headers.map((header) => header.label),
        "Header",
      ),
      ...rows.map((row) => excelRow(headers.map((header) => row[header.key]))),
    ].join("");

  const excelWorksheet = ({ name, rows }) =>
    `<Worksheet ss:Name="${excelSheetName(name)}"><Table>${rows}</Table></Worksheet>`;

  const buildExcelWorkbook = (sheets) => `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF4F3" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
 </Styles>
 ${sheets.map(excelWorksheet).join("")}
</Workbook>`;

  const buildXlsxWorkbook = async (sheets) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "sklad kontur";
    workbook.created = new Date();
    for (const sheet of sheets) {
      const rows = parseSpreadsheetRows(
        `<Workbook><Worksheet><Table>${sheet.rows}</Table></Worksheet></Workbook>`,
      );
      const worksheet = workbook.addWorksheet(
        String(sheet.name).slice(0, 31) || "Sheet",
      );
      worksheet.addRows(rows);
      worksheet.getRow(1).font = { bold: true };
      worksheet.columns.forEach((column) => {
        column.width = Math.min(
          42,
          Math.max(
            12,
            ...column.values.map((value) => String(value ?? "").length + 2),
          ),
        );
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  const excelFile = async (filename, sheets) => ({
    filename: filename.replace(/\.xls$/i, ".xlsx"),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: await buildXlsxWorkbook(sheets),
  });

  const decodeXmlEntities = (value) =>
    String(value ?? "")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  const normalizeImportHeader = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е");

  const parseSpreadsheetRows = (text) => {
    const rows = [];
    const rowMatches = String(text).matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi);
    for (const rowMatch of rowMatches) {
      const cells = [];
      const cellMatches = rowMatch[1].matchAll(
        /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi,
      );
      for (const cellMatch of cellMatches) {
        const indexMatch = cellMatch[1].match(/ss:Index="(\d+)"/i);
        if (indexMatch) {
          const targetIndex = Number(indexMatch[1]) - 1;
          while (cells.length < targetIndex) {
            cells.push("");
          }
        }
        const dataMatch = cellMatch[2].match(
          /<Data\b[^>]*>([\s\S]*?)<\/Data>/i,
        );
        cells.push(
          decodeXmlEntities(dataMatch?.[1]?.replace(/<[^>]+>/g, "") ?? ""),
        );
      }
      if (cells.some((cell) => String(cell).trim())) {
        rows.push(cells);
      }
    }
    return rows;
  };

  const parseDelimitedRows = (text) => {
    const delimiter = String(text).includes(";") ? ";" : ",";
    return String(text)
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const cells = [];
        let current = "";
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
          const char = line[index];
          if (char === '"' && line[index + 1] === '"') {
            current += '"';
            index += 1;
          } else if (char === '"') {
            quoted = !quoted;
          } else if (char === delimiter && !quoted) {
            cells.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        cells.push(current);
        return cells.map((cell) => cell.trim().replace(/^\uFEFF/, ""));
      });
  };

  const parseXlsxRows = async (buffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return [];
    }
    const rows = [];
    worksheet.eachRow((row) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        values[columnNumber - 1] = cell.text || String(cell.value ?? "");
      });
      if (values.some((value) => String(value ?? "").trim())) {
        rows.push(values);
      }
    });
    return rows;
  };

  const parseImportRows = async ({ filename, buffer }) => {
    const extension = path.extname(String(filename ?? "")).toLowerCase();
    if (extension === ".xlsx") {
      return parseXlsxRows(buffer);
    }

    const text = buffer.toString("utf8");
    return String(text).includes("<Workbook")
      ? parseSpreadsheetRows(text)
      : parseDelimitedRows(text);
  };

  const rowsToObjects = (rows, aliases) => {
    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => aliases[normalizeImportHeader(cell)]),
    );
    if (headerRowIndex < 0) {
      throw new Error("Header row not found");
    }
    const headers = rows[headerRowIndex].map(
      (header) => aliases[normalizeImportHeader(header)] ?? null,
    );
    return rows.slice(headerRowIndex + 1).map((row, index) => ({
      rowNumber: headerRowIndex + index + 2,
      values: Object.fromEntries(
        headers
          .map((key, cellIndex) => [key, row[cellIndex]])
          .filter(([key]) => key)
          .map(([key, value]) => [key, String(value ?? "").trim()]),
      ),
    }));
  };
  return {
    excelXmlEscape,
    excelSheetName,
    excelCell,
    excelRow,
    tableRows,
    excelWorksheet,
    buildExcelWorkbook,
    buildXlsxWorkbook,
    excelFile,
    decodeXmlEntities,
    normalizeImportHeader,
    parseSpreadsheetRows,
    parseDelimitedRows,
    parseXlsxRows,
    parseImportRows,
    rowsToObjects,
  };
}
