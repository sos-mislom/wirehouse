import test from "node:test";
import assert from "node:assert/strict";
import { searchTickets } from "../apps/api/src/domain/ticket-search.js";
test("Archive combines room, applicant, category, period and text without searching outside its supplied scope", () => {
  const row = {
    id: "a",
    number: "SD-1",
    title: "Замена вентилятора",
    description: "Шум",
    unitId: "unit-1",
    unitNumber: "101",
    createdBy: "ivan",
    createdByName: "Иван",
    createdAt: "2026-10-10T08:00:00Z",
    status: "closed",
    category: "ventilation",
  };
  const rows = [
    row,
    { ...row, id: "b", unitId: "unit-2" },
    { ...row, id: "c", createdBy: "petr" },
    { ...row, id: "d", createdAt: "2026-09-30T08:00:00Z" },
    { ...row, id: "e", status: "new" },
  ];
  const query = new URLSearchParams({
    archive: "true",
    unitId: "unit-1",
    createdBy: "ivan",
    category: "ventilation",
    from: "2026-10-01",
    to: "2026-10-31",
    q: "ВЕНТИЛЯТОР",
  });
  assert.deepEqual(
    searchTickets(rows, query).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(searchTickets([], query), []);
  assert.throws(
    () =>
      searchTickets(
        rows,
        new URLSearchParams({ from: "2026-11-01", to: "2026-10-31" }),
      ),
    /период/,
  );
});
