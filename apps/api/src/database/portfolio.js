import { AuthDatabase } from "./auth.js";
import { locationForUnit } from "../domain/structure.js";
import {
  activeLeaseStages,
  clone,
  compareCreatedAtDesc,
  compareUnits,
  createChangeResult,
  createId,
  nowIso,
} from "./constants.js";

export class PortfolioDatabase extends AuthDatabase {
  listProperties() {
    return clone([...this.data.properties].sort(compareCreatedAtDesc));
  }

  getProperty(id) {
    const property = this.getById("properties", id);
    return property ? clone(property) : null;
  }

  createProperty(payload) {
    const record = {
      id: createId(),
      name: payload.name,
      address: payload.address,
      total_area: Number(payload.totalArea),
      rentable_area: Number(payload.rentableArea),
      warehouse_class: payload.warehouseClass,
      description: payload.description ?? "",
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    this.validatePropertyPayload(record);
    this.data.properties.push(record);
    return clone(record);
  }

  updateProperty(id, payload) {
    const current = this.getById("properties", id);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      name: payload.name ?? current.name,
      address: payload.address ?? current.address,
      total_area:
        payload.totalArea !== undefined
          ? Number(payload.totalArea)
          : current.total_area,
      rentable_area:
        payload.rentableArea !== undefined
          ? Number(payload.rentableArea)
          : current.rentable_area,
      warehouse_class: payload.warehouseClass ?? current.warehouse_class,
      description: payload.description ?? current.description,
      updated_at: nowIso(),
    };

    this.validatePropertyPayload(next);
    Object.assign(current, next);
    return clone(current);
  }

  deleteProperty(id) {
    if (
      this.data.units.some((u) => u.property_id === id) ||
      this.data.operating_expenses.some((x) => x.propertyId === id) ||
      this.data.floor_plans.some((x) => x.propertyId === id)
    )
      throw new Error(
        "Нельзя удалить объект с помещениями, расходами или планами",
      );
    if (
      [
        ...this.data.equipment,
        ...this.data.meters,
        ...this.data.maintenance_plans,
        ...this.data.service_catalog,
        ...this.data.announcements,
      ].some((x) => x.propertyId === id)
    )
      throw new Error("Объект используется в эксплуатации");
    const current = this.getById("properties", id);
    if (!current) {
      return createChangeResult(0);
    }

    const unitIds = new Set(
      this.data.units
        .filter((unit) => unit.property_id === id)
        .map((unit) => unit.id),
    );
    const ticketIds = new Set(
      this.data.tickets
        .filter(
          (ticket) => ticket.property_id === id || unitIds.has(ticket.unit_id),
        )
        .map((ticket) => ticket.id),
    );
    this.data.leases = this.data.leases.filter(
      (lease) => !unitIds.has(lease.unit_id),
    );
    this.data.ticket_comments = this.data.ticket_comments.filter(
      (comment) => !ticketIds.has(comment.ticket_id),
    );
    this.data.ticket_attachments = this.data.ticket_attachments.filter(
      (attachment) => !ticketIds.has(attachment.ticket_id),
    );
    this.data.ticket_history = this.data.ticket_history.filter(
      (event) => !ticketIds.has(event.ticket_id),
    );
    this.data.tickets = this.data.tickets.filter(
      (ticket) => !ticketIds.has(ticket.id),
    );
    this.data.units = this.data.units.filter((unit) => unit.property_id !== id);
    this.data.users = this.data.users.map((user) =>
      user.property_id === id
        ? {
            ...user,
            property_id: null,
          }
        : user,
    );
    this.data.properties = this.data.properties.filter(
      (property) => property.id !== id,
    );
    return createChangeResult(1);
  }

  listUnits(filters = {}) {
    const activeLeaseByUnit = new Map(
      this.data.leases
        .filter((lease) => activeLeaseStages.has(lease.stage))
        .map((lease) => [lease.unit_id, lease]),
    );

    const rows = this.data.units
      .filter((unit) =>
        filters.propertyId ? unit.property_id === filters.propertyId : true,
      )
      .filter((unit) =>
        filters.status ? unit.status === filters.status : true,
      )
      .map((unit) => {
        const property = this.getPropertyById(unit.property_id);
        const lease = activeLeaseByUnit.get(unit.id) ?? null;
        const tenant = lease ? this.getTenantById(lease.tenant_id) : null;

        return {
          ...unit,
          property_name: property?.name ?? null,
          tenant_name: tenant?.name ?? null,
          lease_stage: lease?.stage ?? null,
          lease_end_date: lease?.end_date ?? null,
        };
      })
      .sort(compareUnits);

    return clone(rows);
  }

  getUnit(id) {
    const unit = this.getById("units", id);
    return unit ? clone(unit) : null;
  }

  createUnit(payload) {
    this.requireProperty(payload.propertyId);
    const location = locationForUnit(this, payload.propertyId, payload);
    this.ensureUnique(
      this.data.units,
      (unit) =>
        unit.property_id === payload.propertyId &&
        unit.number === payload.number &&
        unit.floor_id === location.floor_id,
      "Номер помещения должен быть уникальным в пределах этажа и секции",
    );

    const record = {
      id: createId(),
      property_id: payload.propertyId,
      number: payload.number,
      building: String(payload.building ?? "").trim(),
      entrance: String(payload.entrance ?? "").trim(),
      plan_x: Number(payload.planX ?? 0),
      plan_y: Number(payload.planY ?? 0),
      photo_url: String(payload.photoUrl ?? ""),
      floor: Number(payload.floor),
      area: Number(payload.area),
      type: payload.type,
      status: payload.status,
      ceiling_height: Number(payload.ceilingHeight ?? 0),
      temperature_regime: payload.temperatureRegime ?? "",
      has_ramp: payload.hasRamp ? 1 : 0,
      has_gate: payload.hasGate ? 1 : 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    Object.assign(record, location);
    this.validateUnitPayload(record);
    this.data.units.push(record);
    return clone(record);
  }

  updateUnit(id, payload) {
    const current = this.getById("units", id);
    if (!current) {
      return null;
    }

    const nextPropertyId = payload.propertyId ?? current.property_id;
    this.requireProperty(nextPropertyId);
    if (nextPropertyId !== current.property_id)
      throw new Error("Перенос помещения между объектами запрещён");
    const location = locationForUnit(this, nextPropertyId, {
      building: payload.building ?? current.building,
      entrance: payload.entrance ?? current.entrance,
      floor: payload.floor ?? current.floor,
      floorId:
        payload.floorId ??
        (payload.building === undefined &&
        payload.entrance === undefined &&
        payload.floor === undefined
          ? current.floor_id
          : undefined),
    });

    this.ensureUnique(
      this.data.units,
      (unit) =>
        unit.id !== id &&
        unit.property_id === nextPropertyId &&
        unit.number === (payload.number ?? current.number) &&
        unit.floor_id === location.floor_id,
      "Номер помещения должен быть уникальным в пределах этажа и секции",
    );

    const next = {
      ...current,
      property_id: nextPropertyId,
      number: payload.number ?? current.number,
      building:
        payload.building !== undefined
          ? String(payload.building).trim()
          : (current.building ?? ""),
      entrance:
        payload.entrance !== undefined
          ? String(payload.entrance).trim()
          : (current.entrance ?? ""),
      photo_url:
        payload.photoUrl !== undefined
          ? String(payload.photoUrl)
          : (current.photo_url ?? ""),
      floor:
        payload.floor !== undefined ? Number(payload.floor) : current.floor,
      area: payload.area !== undefined ? Number(payload.area) : current.area,
      type: payload.type ?? current.type,
      status: payload.status ?? current.status,
      ceiling_height:
        payload.ceilingHeight !== undefined
          ? Number(payload.ceilingHeight)
          : current.ceiling_height,
      temperature_regime:
        payload.temperatureRegime ?? current.temperature_regime,
      has_ramp:
        payload.hasRamp !== undefined
          ? payload.hasRamp
            ? 1
            : 0
          : current.has_ramp,
      has_gate:
        payload.hasGate !== undefined
          ? payload.hasGate
            ? 1
            : 0
          : current.has_gate,
      updated_at: nowIso(),
    };

    Object.assign(next, location);
    this.validateUnitPayload(next);
    Object.assign(current, next);
    return clone(current);
  }

  splitUnit(id, payload) {
    const current = this.getById("units", id);
    if (!current) {
      return null;
    }

    if (
      this.countActiveLeasesForUnit(id) > 0 ||
      current.status === "occupied"
    ) {
      throw new Error("Occupied unit cannot be split without lease transfer");
    }

    const newNumber = String(payload.number ?? "").trim();
    const splitArea = Number(payload.area);
    if (!newNumber) {
      throw new Error("New unit number is required");
    }
    if (!Number.isFinite(splitArea) || splitArea <= 0) {
      throw new Error("Split area must be positive");
    }
    if (splitArea >= Number(current.area)) {
      throw new Error("Split area must be less than current unit area");
    }

    this.ensureUnique(
      this.data.units,
      (unit) =>
        unit.property_id === current.property_id && unit.number === newNumber,
      "Номер помещения должен быть уникальным в пределах этажа и секции",
    );

    const created = {
      id: createId(),
      floor_id: current.floor_id,
      building: current.building,
      entrance: current.entrance,
      property_id: current.property_id,
      number: newNumber,
      floor: current.floor,
      area: splitArea,
      type: current.type,
      status: payload.status ?? current.status,
      ceiling_height: current.ceiling_height,
      temperature_regime: current.temperature_regime,
      has_ramp: current.has_ramp,
      has_gate: current.has_gate,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    this.validateUnitPayload(created);
    current.area = Number((Number(current.area) - splitArea).toFixed(2));
    current.updated_at = nowIso();
    this.validateUnitPayload(current);
    this.data.units.push(created);
    return {
      original: clone(current),
      created: clone(created),
    };
  }

  deleteUnit(id) {
    if (
      this.data.leases.some((l) => l.unit_id === id) ||
      this.data.tickets.some((t) => t.unit_id === id) ||
      this.data.floor_plans.some((p) => p.markers?.some((m) => m.unitId === id))
    )
      throw new Error(
        "Нельзя удалить помещение с договорами, заявками или отметками на плане",
      );
    if (
      this.data.equipment.some((x) => x.unitId === id) ||
      this.data.meters.some((x) => x.unitId === id) ||
      this.data.maintenance_plans.some((x) => x.unitId === id)
    )
      throw new Error(
        "Сначала перенесите оборудование, счётчики и ППР помещения",
      );
    const current = this.getById("units", id);
    if (!current) {
      return createChangeResult(0);
    }

    const ticketIds = new Set(
      this.data.tickets
        .filter((ticket) => ticket.unit_id === id)
        .map((ticket) => ticket.id),
    );
    this.data.ticket_comments = this.data.ticket_comments.filter(
      (comment) => !ticketIds.has(comment.ticket_id),
    );
    this.data.ticket_attachments = this.data.ticket_attachments.filter(
      (attachment) => !ticketIds.has(attachment.ticket_id),
    );
    this.data.ticket_history = this.data.ticket_history.filter(
      (event) => !ticketIds.has(event.ticket_id),
    );
    this.data.tickets = this.data.tickets.filter(
      (ticket) => ticket.unit_id !== id,
    );
    this.data.leases = this.data.leases.filter((lease) => lease.unit_id !== id);
    this.data.units = this.data.units.filter((unit) => unit.id !== id);
    return createChangeResult(1);
  }
}
