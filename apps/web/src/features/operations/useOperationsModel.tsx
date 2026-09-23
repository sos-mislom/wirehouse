import { useEffect, useState, type FormEvent } from "react";
import { operationFormDto } from "../../api/operation-form";
import {
  hasPermission,
  rolePermissions,
} from "../../../../../packages/contracts/src/permissions";
import { Input, Select, Textarea } from "../../ui";
import {
  OperationsData,
  Props,
  emptyData,
  request,
  roleNames,
  specialtyNames,
} from "./shared";
export function useOperationsModel({
  token,
  user,
  overview,
  tickets,
  onRefresh,
  onUnit,
  onTicket,
  initialTab = "equipment",
  onCreateUser,
}: Props) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<OperationsData>(emptyData);
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [property, setProperty] = useState("");
  const [query, setQuery] = useState("");
  const [readingMeter, setReadingMeter] = useState("");
  const [readingPeriod, setReadingPeriod] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [readingValue, setReadingValue] = useState("");
  const load = async () =>
    setData(await request<OperationsData>("/api/operations", token));
  useEffect(() => {
    let active = true;
    request<OperationsData>("/api/operations", token)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const change = (key: string, value: unknown) =>
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "role"
        ? { permissions: rolePermissions[String(value)] }
        : {}),
    }));
  const create = () => {
    if (busy) return;
    setError("");
    setNotice("");
    setDraft({
      propertyId: property || overview.properties[0]?.id || "",
      name: "",
      unitId: "",
      responsibleId: "",
      type: "",
      cost: 0,
      status: "active",
      recurrence: "months",
      intervalCount: 1,
      leadDays: 0,
      nextDate: new Date().toISOString().slice(0, 10),
      checklist: "",
      active: true,
      paid: false,
      basePrice: 0,
      hourlyRate: 0,
      tariff: 0,
      initialValue: 0,
      scope: "individual",
      resource: "electricity",
      audience: "all",
      tone: "info",
      published: true,
      date: new Date().toISOString().slice(0, 10),
      amount: "",
    });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const dto = operationFormDto(tab, draft);
      if (
        tab === "users" &&
        (!hasPermission(user, "permissions.manage") || draft.id === user.id)
      )
        delete dto.permissions;
      await request(
        tab === "users"
          ? `/api/users/${draft.id}`
          : `/api/operations/${tab}${draft.id ? `/${draft.id}` : ""}`,
        token,
        draft.id ? "PUT" : "POST",
        dto,
      );
      await load();
      await onRefresh();
      setDraft((current) => (current === draft ? null : current));
      setNotice("Изменения сохранены");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submitReading = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/operations/meters/${readingMeter}/readings`,
        token,
        "POST",
        { period: readingPeriod, value: Number(readingValue) },
      );
      await load();
      setReadingMeter("");
      setReadingValue("");
      setNotice("Показания и распределение сохранены");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const input = (
    key: string,
    label: string,
    type = "text",
    required = false,
    hint = "",
  ) => (
    <label key={key}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Input
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={draft?.[key] ?? ""}
        onChange={(event) => change(key, event.target.value)}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
  const area = (key: string, label: string, required = false) => (
    <label className="form-wide" key={key}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Textarea
        required={required}
        rows={4}
        value={
          Array.isArray(draft?.[key])
            ? draft[key].join("\n")
            : (draft?.[key] ?? "")
        }
        onChange={(event) => change(key, event.target.value)}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    options: Record<string, string>,
    required = false,
  ) => (
    <label key={key}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Select
        required={required}
        value={draft?.[key] ?? ""}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="">Выберите</option>
        {Object.entries(options).map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </Select>
    </label>
  );
  const check = (key: string, label: string) => (
    <label className="check-field" key={key}>
      <Input
        type="checkbox"
        checked={Boolean(draft?.[key])}
        onChange={(event) => change(key, event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
  const units = Object.fromEntries(
    overview.units
      .filter((u) => u.propertyId === draft?.propertyId)
      .map((u) => [
        u.id,
        `${u.building || "Основной корпус"} / ${u.floor} этаж / ${u.number}`,
      ]),
  );
  const workers = Object.fromEntries(
    data.users
      .filter(
        (u) =>
          u.isActive &&
          u.role !== "tenant" &&
          (!u.propertyId || u.propertyId === draft?.propertyId),
      )
      .map((u) => [
        u.id,
        `${u.fullName} · ${specialtyNames[u.specialty] || roleNames[u.role]}`,
      ]),
  );
  const rows = (data[tab as keyof OperationsData] || []).filter(
    (r) =>
      (!property || r.propertyId === property) &&
      `${r.name || r.fullName || ""} ${r.serialNumber || ""} ${r.email || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const unitName = (id?: string) =>
    overview.units.find((u) => u.id === id)?.number || "Общие зоны";
  return {
    token,
    user,
    overview,
    tickets,
    onRefresh,
    onUnit,
    onTicket,
    initialTab,
    onCreateUser,
    tab,
    setTab,
    data,
    setData,
    draft,
    setDraft,
    error,
    setError,
    busy,
    setBusy,
    notice,
    setNotice,
    property,
    setProperty,
    query,
    setQuery,
    readingMeter,
    setReadingMeter,
    readingPeriod,
    setReadingPeriod,
    readingValue,
    setReadingValue,
    load,
    change,
    create,
    save,
    submitReading,
    input,
    area,
    select,
    check,
    units,
    workers,
    rows,
    unitName,
  };
}
export type OperationsModel = ReturnType<typeof useOperationsModel>;
