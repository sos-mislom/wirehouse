type SearchRow = {
  status: string;
  category: string;
  unitId: string;
  createdBy: string;
  createdAt: string;
  number: string;
  title: string;
  description: string;
  propertyName?: string | null;
  unitNumber?: string | null;
  tenantName?: string | null;
  createdByName?: string | null;
  assignedToName?: string | null;
};
export function filterTickets<T extends SearchRow>(
  tickets: T[],
  params: URLSearchParams,
): T[] {
  const query = (params.get("q") ?? "").slice(0, 300).toLocaleLowerCase("ru"),
    from = params.get("from"),
    to = params.get("to");
  return tickets.filter(
    (t) =>
      (!params.get("status") || t.status === params.get("status")) &&
      (params.get("archive") !== "true" ||
        ["closed", "rejected", "completed", "resolved"].includes(t.status)) &&
      (!params.get("category") || t.category === params.get("category")) &&
      (!params.get("unitId") || t.unitId === params.get("unitId")) &&
      (!params.get("createdBy") || t.createdBy === params.get("createdBy")) &&
      (!from || t.createdAt.slice(0, 10) >= from) &&
      (!to || t.createdAt.slice(0, 10) <= to) &&
      (!query ||
        [
          t.number,
          t.title,
          t.description,
          t.propertyName,
          t.unitNumber,
          t.tenantName,
          t.createdByName,
          t.assignedToName,
          t.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query)),
  );
}
