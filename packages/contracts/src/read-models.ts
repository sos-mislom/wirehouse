export type SessionUser = {
  permissions: string[];
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: "admin" | "manager" | "worker" | "tenant";
  propertyId: string | null;
  tenantId: string | null;
  lastLoginAt: string | null;
  totpEnabled: boolean;
};

export type Property = {
  id: string;
  name: string;
  address: string;
  totalArea: number;
  rentableArea: number;
  warehouseClass: string;
  description: string;
};

export type Unit = {
  floorId: string;
  id: string;
  propertyId: string;
  building: string;
  entrance: string;
  photoUrl: string;
  number: string;
  floor: number;
  area: number;
  type: string;
  status: string;
  ceilingHeight: number;
  temperatureRegime: string;
  description: string;
  hasRamp: boolean;
  hasGate: boolean;
  propertyName: string | null;
  tenantName: string | null;
  leaseStage: string | null;
  leaseEndDate: string | null;
};

export type Tenant = {
  id: string;
  name: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  riskLevel: string;
  status: string;
  leaseCount: number;
  paymentDiscipline?: number;
};

export type Lease = {
  id: string;
  tenantId: string;
  unitId: string;
  contractNumber: string;
  stage: string;
  startDate: string;
  endDate: string;
  ratePerSqm: number;
  deposit: number;
  indexationPct: number;
  tenantName: string | null;
  unitNumber: string | null;
  propertyName: string | null;
  documentName: string;
};

export type LeaseDocument = {
  id: string;
  leaseId: string;
  fileName: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

export type Ticket = {
  equipmentId?: string | null;
  serviceId?: string | null;
  leaseId?: string | null;
  maintenancePlanId?: string | null;
  workLogs?: Array<{
    id: string;
    description: string;
    hours: number;
    materialCost: number;
    cost: number;
    createdByName: string;
  }>;
  id: string;
  number: string;
  unitId: string;
  propertyId: string;
  tenantId: string | null;
  createdBy: string;
  assignedTo: string | null;
  category: string;
  priority: string;
  status: string;
  sourceChannel: string;
  title: string;
  description: string;
  slaHours: number;
  slaDueAt: string | null;
  checklistItems: TicketChecklistItem[];
  propertyName: string | null;
  unitNumber: string | null;
  tenantName: string | null;
  createdByName: string | null;
  assignedToName: string | null;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type TicketChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
};

export type ChecklistTemplate = {
  category: string;
  items: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
};

export type TicketComment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string | null;
  authorRole: string | null;
  sourceChannel: string;
  content: string;
  createdAt: string;
};

export type TicketAttachment = {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video" | "file";
  sizeBytes: number;
  note: string;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

export type FinancePoint = {
  expenses: number;
  invoiceAmount: number;
  contractAmount: number;
  details: {
    leaseId: string;
    contractNumber: string;
    unitNumber: string;
    basis: string;
    amount: number;
    days: number;
  }[];
  id: string;
  label: string;
  billed: number;
  collected: number;
  forecast: number;
};

export type FinanceSummary = {
  collectionBilled: number;
  collectionPaid: number;
  collectionRate: number;
  collectionPeriod?: string;
  collectionPeriodLabel?: string;
  collectionBasis?: "current_due" | "last_closed" | "forecast";
  arrearsAmount: number;
  opexRatio: number;
  noi: number;
  forecastQuarter: number;
  forecastPeriodLabel?: string;
  series: FinancePoint[];
};

export type NotificationItem = {
  id: string;
  tone: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  createdAt: string;
  propertyName: string | null;
  entityType: string;
  entityId: string | null;
  unread: boolean;
};

export type TeamMember = {
  id: string;
  fullName: string;
  role: "admin" | "manager" | "worker" | "tenant";
  propertyId: string | null;
  propertyName: string | null;
  email: string | null;
  phone: string | null;
  assignedTicketCount: number;
  urgentTicketCount: number;
  openTicketCount: number;
  shift: string;
  focus: string;
  lastLoginAt: string | null;
  isCurrentUser: boolean;
};

export type ExportSnapshot = {
  id: string;
  name: string;
  format: string;
  cadence: string;
  scope: string;
  status: "ready" | "scheduled" | "draft";
  updatedAt: string;
};

export type TenantPayment = {
  id: string;
  period: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  status: "paid" | "partial" | "late" | "overdue" | "upcoming";
  method: string;
};

export type BillingInvoice = {
  id: string;
  leaseId: string;
  tenantId: string;
  unitId: string;
  period: string;
  rentAmount: number;
  variableAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: "paid" | "partial" | "late" | "overdue" | "upcoming";
  tenantName: string | null;
  contractNumber: string | null;
  propertyName: string | null;
  unitNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingReconciliation = {
  summary: {
    invoices: number;
    billed: number;
    paid: number;
    outstanding: number;
    overpaid: number;
    matched: number;
    issues: number;
    collectionRate: number;
  };
  rows: Array<{
    invoiceId: string;
    period: string;
    tenantName: string;
    contractNumber: string;
    propertyName: string;
    unitNumber: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    overpaidAmount: number;
    dueDate: string;
    lastPaidAt: string | null;
    invoiceStatus: string;
    reconciliationStatus:
      "matched" | "partial" | "overdue" | "unpaid" | "overpaid";
    issue: string;
    paymentCount: number;
  }>;
};

export type TenantMeter = {
  id: string;
  unitId: string;
  tenantId: string;
  period: string;
  meterType: "power" | "electricity" | "cold_chain" | "heating" | "water";
  name: string;
  unitNumber: string;
  lastValue: number;
  previousValue: number;
  consumption: number;
  tariffRate: number;
  chargeAmount: number;
  deltaPct: number;
  updatedAt: string;
  status: "stable" | "attention";
};

export type TenantNote = {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
  content: string;
  attachments: TenantNoteAttachment[];
};

export type TenantNoteAttachment = {
  id: string;
  noteId: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

export type CommentDelivery = {
  delivered: boolean;
  channels: string[];
  errors: string[];
};

export type ImportResult = {
  templateId: string;
  fileName: string;
  summary: {
    total: number;
    ready?: number;
    created: number;
    updated?: number;
    errors: number;
  };
  rows: Array<{
    row: number;
    status: string;
    action?: string;
    changes?: string;
    message: string;
    entityId: string;
  }>;
  report: {
    filename: string;
    contentBase64: string;
  };
  batch?: ImportBatch | null;
  requiresApproval?: boolean;
  approval?: ImportApproval | null;
};

export type ImportDraft = {
  templateId: string;
  fileName: string;
  contentBase64: string;
  mode: "create" | "update" | "upsert";
};

export type ImportBatch = {
  id: string;
  templateId: string;
  fileName: string;
  mode: "create" | "update" | "upsert";
  status: "applied" | "rolled_back";
  summary: {
    total?: number;
    created?: number;
    updated?: number;
    errors?: number;
  };
  operationCount: number;
  createdByName: string | null;
  createdAt: string;
  rolledBackAt: string | null;
};

export type ImportApproval = {
  id: string;
  templateId: string;
  fileName: string;
  mode: "create" | "update" | "upsert";
  status: "pending" | "approved" | "rejected";
  summary: {
    total?: number;
    ready?: number;
    created?: number;
    updated?: number;
    errors?: number;
  };
  rowCount: number;
  requestedByName: string | null;
  createdAt: string;
  decidedAt: string | null;
  batchId: string | null;
};

export type SystemReadiness = {
  status: "ready" | "attention";
  generatedAt: string;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    status: string;
    message: string;
  }>;
  database: {
    ok: boolean;
    backend?: string;
    message: string;
  };
  storage: {
    ok: boolean;
    driver?: string;
    message: string;
  };
  redis: {
    ok: boolean;
    message: string;
  };
  secrets: Record<string, boolean>;
};

export type TenantRisk = {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  owner: string;
  dueDate: string;
  status: string;
};

export type TenantDetail = {
  tenant: Tenant;
  summary: {
    totalArea: number;
    unitCount: number;
    activeLeaseCount: number;
    monthlyRent: number;
    paymentDiscipline: number;
    openTicketCount: number;
    arrearsAmount: number;
    nextExpiry: string | null;
  };
  units: Unit[];
  leases: Lease[];
  tickets: Ticket[];
  payments: TenantPayment[];
  meters: TenantMeter[];
  notes: TenantNote[];
  risks: TenantRisk[];
};

export type Overview = {
  totals: {
    property_count: number;
    total_rentable_area: number;
    unit_count: number;
    occupied_area: number;
    vacant_area: number;
    tenant_count: number;
    active_lease_count: number;
  };
  occupancyRate: number;
  expiringLeaseCount: number;
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  finance: FinanceSummary;
  notifications: NotificationItem[];
  team: TeamMember[];
  exports: ExportSnapshot[];
};

export type TicketHistoryEvent = {
  id: string;
  ticketId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type TenantOnboardingChannel = {
  id: "telegram" | "vk" | "whatsapp";
  label: string;
  url: string;
  enabled: boolean;
  instruction: string;
};

export type TenantOnboarding = {
  channels: TenantOnboardingChannel[];
};
