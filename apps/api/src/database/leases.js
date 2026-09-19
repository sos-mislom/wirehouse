import { TenantsDatabase } from "./tenants.js";
import {
  activeLeaseStages,
  clone,
  compareLeases,
  createChangeResult,
  leaseOverlaps,
  createId,
  nowIso,
} from "./constants.js";

export class LeasesDatabase extends TenantsDatabase {
  listLeases() {
    const rows = this.data.leases
      .map((lease) => {
        const tenant = this.getTenantById(lease.tenant_id);
        const unit = this.getUnitById(lease.unit_id);
        const property = unit ? this.getPropertyById(unit.property_id) : null;

        return {
          ...lease,
          tenant_name: tenant?.name ?? null,
          unit_number: unit?.number ?? null,
          property_name: property?.name ?? null,
        };
      })
      .sort(compareLeases);

    return clone(rows);
  }

  getLease(id) {
    const lease = this.getById("leases", id);
    return lease ? clone(lease) : null;
  }

  createLease(payload) {
    this.requireTenant(payload.tenantId);
    this.requireUnit(payload.unitId);
    this.ensureUnique(
      this.data.leases,
      (lease) =>
        lease.unit_id === payload.unitId &&
        leaseOverlaps(lease, {
          stage: payload.stage,
          start_date: payload.startDate,
          end_date: payload.endDate,
        }),
      "Unit already has a lease",
    );
    this.ensureUnique(
      this.data.leases,
      (lease) => lease.contract_number === payload.contractNumber,
      "Contract number must be unique",
    );

    const record = {
      id: createId(),
      tenant_id: payload.tenantId,
      unit_id: payload.unitId,
      contract_number: payload.contractNumber,
      stage: payload.stage,
      start_date: payload.startDate,
      end_date: payload.endDate,
      rate_per_sqm: Number(payload.ratePerSqm),
      deposit: Number(payload.deposit ?? 0),
      indexation_pct: Number(payload.indexationPct ?? 0),
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    this.validateLeasePayload(record);
    this.data.leases.push(record);

    if (activeLeaseStages.has(record.stage)) {
      this.setUnitStatus(record.unit_id, "occupied");
    }

    return clone(record);
  }

  updateLease(id, payload) {
    const current = this.getById("leases", id);
    if (!current) {
      return null;
    }

    const nextTenantId = payload.tenantId ?? current.tenant_id;
    const nextUnitId = payload.unitId ?? current.unit_id;
    this.requireTenant(nextTenantId);
    this.requireUnit(nextUnitId);
    this.ensureUnique(
      this.data.leases,
      (lease) =>
        lease.id !== id &&
        lease.unit_id === nextUnitId &&
        leaseOverlaps(lease, {
          stage: payload.stage ?? current.stage,
          start_date: payload.startDate ?? current.start_date,
          end_date: payload.endDate ?? current.end_date,
        }),
      "Unit already has a lease",
    );
    this.ensureUnique(
      this.data.leases,
      (lease) =>
        lease.id !== id &&
        lease.contract_number ===
          (payload.contractNumber ?? current.contract_number),
      "Contract number must be unique",
    );

    const previousUnitId = current.unit_id;
    const next = {
      ...current,
      tenant_id: nextTenantId,
      unit_id: nextUnitId,
      contract_number: payload.contractNumber ?? current.contract_number,
      stage: payload.stage ?? current.stage,
      start_date: payload.startDate ?? current.start_date,
      end_date: payload.endDate ?? current.end_date,
      rate_per_sqm:
        payload.ratePerSqm !== undefined
          ? Number(payload.ratePerSqm)
          : current.rate_per_sqm,
      deposit:
        payload.deposit !== undefined
          ? Number(payload.deposit)
          : current.deposit,
      indexation_pct:
        payload.indexationPct !== undefined
          ? Number(payload.indexationPct)
          : current.indexation_pct,
      updated_at: nowIso(),
    };

    this.validateLeasePayload(next);
    Object.assign(current, next);

    if (
      previousUnitId !== current.unit_id &&
      this.countActiveLeasesForUnit(previousUnitId, id) === 0
    ) {
      this.setUnitStatus(previousUnitId, "vacant");
    }

    if (activeLeaseStages.has(current.stage)) {
      this.setUnitStatus(current.unit_id, "occupied");
    } else if (this.countActiveLeasesForUnit(current.unit_id, id) === 0) {
      this.setUnitStatus(current.unit_id, "vacant");
    }

    return clone(current);
  }

  deleteLease(id) {
    if (
      this.data.billing_invoices.some((i) => i.lease_id === id) ||
      this.data.tickets.some((t) => t.lease_id === id) ||
      this.data.lease_documents.some((d) => d.lease_id === id)
    )
      throw new Error(
        "Нельзя удалить договор со счетами, заявками или документами; используйте статус «Расторгнут»",
      );
    const current = this.getById("leases", id);
    if (!current) {
      return createChangeResult(0);
    }

    this.data.leases = this.data.leases.filter((lease) => lease.id !== id);
    this.data.lease_followups = this.data.lease_followups.filter(
      (entry) => entry.leaseId !== id,
    );
    this.data.lease_documents = this.data.lease_documents.filter(
      (document) => document.lease_id !== id,
    );
    if (this.countActiveLeasesForUnit(current.unit_id) === 0) {
      this.setUnitStatus(current.unit_id, "vacant");
    }
    return createChangeResult(1);
  }

  listLeaseDocuments(leaseId) {
    return clone(
      this.data.lease_documents
        .filter((document) => document.lease_id === leaseId)
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ),
    );
  }

  getLeaseDocument(id) {
    const document = this.getById("lease_documents", id);
    return document ? clone(document) : null;
  }

  createLeaseDocument(payload) {
    const lease = this.getLeaseById(payload.leaseId);
    if (!lease) {
      throw new Error("Lease not found");
    }

    const uploader = this.getById("users", payload.uploadedBy);
    if (!uploader) {
      throw new Error("Uploader not found");
    }

    const record = {
      id: createId(),
      lease_id: payload.leaseId,
      file_name: payload.fileName,
      stored_name: payload.storedName,
      document_category: payload.category ?? "other",
      mime_type: payload.mimeType,
      size_bytes: Number(payload.sizeBytes),
      uploaded_by: payload.uploadedBy,
      uploaded_by_name: uploader.full_name,
      created_at: nowIso(),
    };

    this.data.lease_documents.push(record);
    lease.updated_at = nowIso();
    return clone(record);
  }

  deleteLeaseDocument(id) {
    const current = this.getById("lease_documents", id);
    if (!current) {
      return { result: createChangeResult(0), document: null };
    }

    this.data.lease_documents = this.data.lease_documents.filter(
      (document) => document.id !== id,
    );
    const lease = this.getLeaseById(current.lease_id);
    if (lease) {
      lease.updated_at = nowIso();
    }
    return { result: createChangeResult(1), document: clone(current) };
  }

}
