import { BillingDatabase } from "./billing.js";
import {
  activeLeaseStages,
  clone,
  createId,
  ensureArray,
  nowIso,
} from "./constants.js";

export class WarehouseDatabase extends BillingDatabase {
  listImportApprovals() {
    return clone(
      this.data.import_approvals
        .map((approval) => ({
          ...approval,
          row_count: Array.isArray(approval.rows) ? approval.rows.length : 0,
        }))
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ),
    );
  }

  getImportApproval(id) {
    const approval = this.getById("import_approvals", id);
    return approval ? clone(approval) : null;
  }

  createImportApproval(payload) {
    const record = {
      id: createId(),
      template_id: payload.templateId,
      file_name: payload.fileName,
      mode: payload.mode,
      content_base64: payload.contentBase64,
      summary: clone(payload.summary ?? {}),
      rows: clone(payload.rows ?? []),
      report: clone(payload.report ?? null),
      requested_by: payload.requestedBy ?? null,
      requested_by_name: payload.requestedByName ?? null,
      status: "pending",
      created_at: nowIso(),
      decided_at: null,
      decided_by: null,
      batch_id: null,
    };

    this.data.import_approvals.push(record);
    return clone(record);
  }

  markImportApprovalApproved(id, userId, batchId) {
    const approval = this.getById("import_approvals", id);
    if (!approval) {
      return null;
    }

    approval.status = "approved";
    approval.decided_at = nowIso();
    approval.decided_by = userId;
    approval.batch_id = batchId ?? null;
    return clone(approval);
  }

  rejectImportApproval(id, userId) {
    const approval = this.getById("import_approvals", id);
    if (!approval) {
      return null;
    }
    if (approval.status !== "pending") {
      throw new Error("Import approval is already closed");
    }

    approval.status = "rejected";
    approval.decided_at = nowIso();
    approval.decided_by = userId;
    return clone(approval);
  }

  listImportBatches() {
    return clone(
      this.data.import_batches
        .map((batch) => ({
          ...batch,
          operation_count: Array.isArray(batch.operations)
            ? batch.operations.length
            : 0,
        }))
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ),
    );
  }

  getImportBatch(id) {
    const batch = this.getById("import_batches", id);
    return batch ? clone(batch) : null;
  }

  createImportBatch(payload) {
    const record = {
      id: createId(),
      template_id: payload.templateId,
      file_name: payload.fileName,
      mode: payload.mode,
      summary: clone(payload.summary ?? {}),
      rows: clone(payload.rows ?? []),
      operations: clone(payload.operations ?? []),
      created_by: payload.createdBy ?? null,
      created_by_name: payload.createdByName ?? null,
      status: "applied",
      rollback_error: null,
      created_at: nowIso(),
      rolled_back_at: null,
    };

    this.data.import_batches.push(record);
    return clone(record);
  }

  rollbackImportBatch(id, userId = null) {
    const batch = this.getById("import_batches", id);
    if (!batch) {
      return null;
    }
    if (batch.status === "rolled_back") {
      throw new Error("Import batch already rolled back");
    }

    const operations = Array.isArray(batch.operations)
      ? [...batch.operations].reverse()
      : [];
    for (const operation of operations) {
      if (operation.action === "create") {
        if (operation.entity_type === "tenant") {
          this.deleteTenant(operation.entity_id);
        } else if (operation.entity_type === "unit") {
          this.deleteUnit(operation.entity_id);
        } else if (operation.entity_type === "lease") {
          this.deleteLease(operation.entity_id);
        } else if (operation.entity_type === "payment") {
          this.deleteBillingPayment(operation.entity_id);
        }
      } else if (operation.action === "update" && operation.before) {
        if (operation.entity_type === "tenant") {
          this.updateTenant(operation.entity_id, operation.before);
        } else if (operation.entity_type === "unit") {
          this.updateUnit(operation.entity_id, operation.before);
        } else if (operation.entity_type === "lease") {
          this.updateLease(operation.entity_id, operation.before);
        } else if (operation.entity_type === "payment") {
          this.updateBillingPayment(operation.entity_id, operation.before);
        }
      }
    }

    batch.status = "rolled_back";
    batch.rolled_back_at = nowIso();
    batch.rolled_back_by = userId;
    batch.rollback_error = null;
    return clone(batch);
  }


  createNotification(payload) {
    const event = {
      id: createId(),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      tone: payload.tone ?? "info",
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      property_id: payload.propertyId ?? null,
      tenant_id: payload.tenantId ?? null,
      created_by: payload.createdBy ?? null,
      created_at: nowIso(),
    };

    const deliveries = ensureArray(payload.deliveries).map((delivery) => ({
      id: createId(),
      notification_id: event.id,
      channel: delivery.channel,
      recipient_user_id: delivery.userId ?? null,
      recipient_email: delivery.email ?? null,
      status:
        delivery.status ??
        (delivery.channel === "in_app" ? "delivered" : "pending"),
      attempts: Number(delivery.attempts ?? 0),
      external_message_id: delivery.externalMessageId ?? null,
      error: delivery.error ?? null,
      read_at: null,
      delivered_at:
        delivery.status === "delivered" || delivery.channel === "in_app"
          ? nowIso()
          : null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }));

    this.data.notification_events.push(event);
    this.data.notification_deliveries.push(...deliveries);
    return {
      event: clone(event),
      deliveries: clone(deliveries),
    };
  }

  updateNotificationDelivery(id, payload) {
    const delivery = this.getById("notification_deliveries", id);
    if (!delivery) {
      return null;
    }

    Object.assign(delivery, {
      status: payload.status ?? delivery.status,
      attempts:
        payload.attempts !== undefined
          ? Number(payload.attempts)
          : delivery.attempts,
      external_message_id:
        payload.externalMessageId ?? delivery.external_message_id,
      error: payload.error ?? null,
      delivered_at:
        payload.status === "delivered" ? nowIso() : delivery.delivered_at,
      updated_at: nowIso(),
    });
    return clone(delivery);
  }

  listNotificationsForUser(userId) {
    const deliveries = this.data.notification_deliveries.filter(
      (delivery) =>
        delivery.channel === "in_app" && delivery.recipient_user_id === userId,
    );
    const eventById = new Map(
      this.data.notification_events.map((event) => [event.id, event]),
    );
    return clone(
      deliveries
        .map((delivery) => {
          const event = eventById.get(delivery.notification_id);
          if (!event) {
            return null;
          }
          return {
            ...event,
            delivery_id: delivery.id,
            delivery_status: delivery.status,
            read_at: delivery.read_at,
            unread: !delivery.read_at,
          };
        })
        .filter(Boolean)
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ),
    );
  }

  markNotificationRead({ userId, deliveryId }) {
    const delivery = this.getById("notification_deliveries", deliveryId);
    if (
      !delivery ||
      delivery.channel !== "in_app" ||
      delivery.recipient_user_id !== userId
    ) {
      return null;
    }
    delivery.read_at = delivery.read_at ?? nowIso();
    delivery.updated_at = nowIso();
    return clone(delivery);
  }

  getDashboardOverview() {
    const propertyCount = this.data.properties.length;
    const totalRentableArea = this.data.properties.reduce(
      (total, property) => total + Number(property.rentable_area),
      0,
    );
    const unitCount = this.data.units.length;
    const occupiedArea = this.data.units.reduce(
      (total, unit) =>
        total + (unit.status === "occupied" ? Number(unit.area) : 0),
      0,
    );
    const vacantArea = this.data.units.reduce(
      (total, unit) =>
        total + (unit.status === "vacant" ? Number(unit.area) : 0),
      0,
    );
    const activeLeaseCount = this.data.leases.filter((lease) =>
      activeLeaseStages.has(lease.stage),
    ).length;
    const tenantCount = this.data.tenants.length;
    const expiringLeaseCount = this.data.leases.filter((lease) => {
      if (!activeLeaseStages.has(lease.stage)) {
        return false;
      }

      const ms = new Date(lease.end_date).getTime() - Date.now();
      return Math.ceil(ms / (1000 * 60 * 60 * 24)) <= 45;
    }).length;

    return {
      totals: {
        property_count: propertyCount,
        total_rentable_area: totalRentableArea,
        unit_count: unitCount,
        occupied_area: occupiedArea,
        vacant_area: vacantArea,
        tenant_count: tenantCount,
        active_lease_count: activeLeaseCount,
      },
      occupancyRate:
        totalRentableArea > 0
          ? Number(((occupiedArea / totalRentableArea) * 100).toFixed(1))
          : 0,
      expiringLeaseCount,
    };
  }
}
