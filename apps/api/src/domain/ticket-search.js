import { businessError } from "./accounting.js";
import { filterTickets } from "../../../../packages/contracts/src/ticket-search.ts";
export function searchTickets(tickets, params) {
  const from = params.get("from"),
    to = params.get("to");
  if (
    [from, to].some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    (from && to && from > to)
  )
    throw businessError("Неверный период поиска", 400);
  return filterTickets(tickets, params);
}
