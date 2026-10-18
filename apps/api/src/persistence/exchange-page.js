import { decodeRow } from "./schema.js";
import { literalSearch, searchable } from "./search.js";

// An explicit metadata projection avoids reading/decompressing JSONB payloads.
const columns =
  "id,source_id,message_id,kind,status,attempts,error,correlation_id,created_at,updated_at,next_attempt_at,result,_sequence";
const messages = `(
  SELECT 'inbox'::text AS direction,${columns} FROM warehouse.exchange_inbox
  UNION ALL
  SELECT 'outbox'::text AS direction,${columns} FROM warehouse.exchange_outbox
) messages JOIN warehouse.accounting_sources sources ON sources.id=messages.source_id`;
const where = `($1='' OR messages.direction=$1)
  AND ($2='' OR messages.status=$2)
  AND ($3='' OR messages.source_id=$3)
  AND ($4='' OR ${searchable("concat_ws(' ',messages.message_id,messages.kind,messages.error,sources.name)")} LIKE '%' || $4 || '%')`;

export async function exchangePage(
  client,
  { direction, status, sourceId, q, offset, limit },
) {
  const params = [direction, status, sourceId, literalSearch(q)];
  const count = await client.query(
    `SELECT count(*)::int AS total FROM ${messages} WHERE ${where}`,
    params,
  );
  const rows = await client.query(
    `SELECT messages.*, sources.name AS source_name FROM ${messages} WHERE ${where}
     ORDER BY messages.created_at DESC NULLS LAST,messages.direction,messages._sequence DESC LIMIT $5 OFFSET $6`,
    [...params, limit, offset],
  );
  return {
    items: rows.rows.map((row) => {
      const { payload, payloadHash, ...item } = decodeRow(
        `exchange_${row.direction}`,
        row,
      );
      return { ...item, direction: row.direction, sourceName: row.source_name };
    }),
    total: count.rows[0].total,
    offset,
    limit,
  };
}
