import { isDeepStrictEqual } from "node:util";
import {
  tables,
  emptyData,
  quote,
  relation,
  rowKey,
  encodeRow,
  decodeRow,
} from "./schema.js";

export async function loadRows(client) {
  const names = Object.keys(tables);
  // One round trip; REPEATABLE READ or the write lock gives one consistent view.
  const results = await client.query(
    names
      .map((name) => `SELECT * FROM ${relation(name)} ORDER BY _sequence`)
      .join(";"),
  );
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      results[index].rows.map((row) => decodeRow(name, row)),
    ]),
  );
}
export function normalizedData(data) {
  const normalized = emptyData();
  for (const [name, table] of Object.entries(tables)) {
    if (data[name] !== undefined && !Array.isArray(data[name]))
      throw new Error(`Invalid collection: ${name}`);
    normalized[name] = (data[name] ?? []).map((row) => {
      const values = encodeRow(name, row);
      return Object.fromEntries(
        table.columns.map((column, index) => [
          column.name,
          column.type === "jsonb" && values[index] !== null
            ? JSON.parse(values[index])
            : values[index],
        ]),
      );
    });
  }
  const unknown = Object.keys(data).filter((name) => !tables[name]);
  if (unknown.length)
    throw new Error(`Unknown collections: ${unknown.join(", ")}`);
  return normalized;
}
export async function flushRows(client, before, after) {
  let written = 0;
  for (const [name, table] of Object.entries(tables)) {
    const oldRows = new Map(
      before[name].map((row) => [rowKey(table, row), row]),
    );
    const nextRows = new Map(
      after[name].map((row) => [rowKey(table, row), row]),
    );
    if (nextRows.size !== after[name].length)
      throw new Error(`Duplicate identity in ${name}`);
    const keyColumns = table.key.map((key) =>
      table.columns.find((c) => c.name === key),
    );
    for (const [key, row] of oldRows)
      if (!nextRows.has(key)) {
        await client.query(
          `DELETE FROM ${relation(name)} WHERE ${keyColumns.map((c, i) => `${quote(c.sql)} = $${i + 1}`).join(" AND ")}`,
          table.key.map((k) => row[k]),
        );
        written++;
      }
    const changed = after[name].filter(
      (row) => !isDeepStrictEqual(row, oldRows.get(rowKey(table, row))),
    );
    for (let offset = 0; offset < changed.length; offset += 200) {
      const chunk = changed.slice(offset, offset + 200);
      const params = chunk.flatMap((row) => encodeRow(name, row));
      const values = chunk
        .map(
          (_, index) =>
            `(${table.columns.map((__, c) => `$${index * table.columns.length + c + 1}`).join(",")})`,
        )
        .join(",");
      const update = table.columns
        .filter((c) => !table.key.includes(c.name))
        .map((c) => `${quote(c.sql)} = EXCLUDED.${quote(c.sql)}`)
        .join(",");
      await client.query(
        `INSERT INTO ${relation(name)} (${table.columns.map((c) => quote(c.sql)).join(",")}) VALUES ${values} ON CONFLICT (${keyColumns.map((c) => quote(c.sql)).join(",")}) DO UPDATE SET ${update}`,
        params,
      );
      written += chunk.length;
    }
  }
  return written;
}
