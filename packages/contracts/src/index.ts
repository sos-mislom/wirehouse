export type UserRole = "admin" | "manager" | "worker" | "tenant";

export type WarehouseClass = "A+" | "A" | "B+" | "B" | "C" | "D";
export type UnitStatus = "vacant" | "occupied" | "maintenance";
export type UnitType = "warm" | "cold" | "freezer" | "open" | "office";
export type LeaseStage =
  | "draft"
  | "formed"
  | "sent"
  | "signed"
  | "active"
  | "prolongation"
  | "terminated";

export type TenantRisk = "low" | "medium" | "high";
export type MeterType = "electricity" | "heating" | "water";

export type TicketStatus =
  | "new"
  | "accepted"
  | "in_progress"
  | "completed"
  | "closed"
  | "rejected"
  | "waiting_tenant"
  | "resolved";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketCategory =
  | "gates_ramps"
  | "electrical"
  | "plumbing"
  | "heating"
  | "security"
  | "territory"
  | "loading_equipment"
  | "ventilation"
  | "maintenance"
  | "billing"
  | "access"
  | "damage"
  | "cleaning"
  | "other";

export type TicketSource =
  | "web"
  | "android"
  | "desktop"
  | "telegram"
  | "vk"
  | "phone";

export type InvoiceStatus =
  | "paid"
  | "partial"
  | "late"
  | "overdue"
  | "upcoming";

export type NotificationChannel = "in_app" | "email" | "telegram" | "vk";
export type VisualizationLayer =
  | "vacancy"
  | "lease_risk"
  | "payment_risk"
  | "sla_pressure"
  | "maintenance_hotspots";

export type NotificationEvent =
  | "ticket_created"
  | "ticket_assigned"
  | "ticket_completed"
  | "ticket_overdue"
  | "ticket_updated"
  | "ticket_comment_added"
  | "lease_expiring"
  | "payment_overdue";

export interface Property {
  id: string;
  name: string;
  address: string;
  totalArea: number;
  rentableArea: number;
  warehouseClass: WarehouseClass;
}

export interface Unit {
  id: string;
  propertyId: string;
  number: string;
  type: UnitType;
  status: UnitStatus;
  area: number;
  floor?: number;
  temperatureRegime?: string;
  ceilingHeight?: number;
  hasRamp?: boolean;
  hasGate?: boolean;
  description?: string;
}

export interface Tenant {
  id: string;
  name: string;
  inn: string;
  phone: string;
  email: string;
  riskLevel: TenantRisk;
}

export interface Lease {
  id: string;
  tenantId: string;
  unitId: string;
  contractNumber: string;
  stage: LeaseStage;
  ratePerSqm: number;
  startDate: string;
  endDate: string;
}

export interface Ticket {
  id: string;
  number?: string;
  unitId: string;
  propertyId?: string;
  tenantId: string;
  createdBy: string;
  assignedTo?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  title: string;
  description: string;
  slaDueAt?: string;
}

export interface NotificationDispatchRequest {
  event: NotificationEvent;
  channels: NotificationChannel[];
  recipient: {
    userId?: string;
    email?: string;
    telegramChatId?: string;
    vkUserId?: string;
    role?: UserRole;
  };
  payload: Record<string, unknown>;
}

export interface BuildingTwinUnitState {
  unitId: string;
  label: string;
  floor: number;
  area: number;
  status: UnitStatus;
  layer: VisualizationLayer;
  severity: "low" | "medium" | "high";
}

export interface SmartGalleryAsset {
  id: string;
  ticketId: string;
  unitId: string;
  capturedAt: string;
  mediaType: "photo" | "video";
  stage: "before" | "during" | "after";
  issueCategory: TicketCategory;
  tags: string[];
}
