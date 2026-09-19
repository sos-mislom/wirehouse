import {ticketStatusOptions} from '../projectData';
import {navSections} from './navigation';
import type {TenantPayment} from '../../../../packages/contracts/src/read-models';
export type {SessionUser,Property,Unit,Tenant,Lease,LeaseDocument,Ticket,TicketChecklistItem,ChecklistTemplate,TicketComment,TicketAttachment,FinancePoint,FinanceSummary,NotificationItem,TeamMember,ExportSnapshot,TenantPayment,BillingInvoice,BillingReconciliation,TenantMeter,TenantNote,TenantNoteAttachment,CommentDelivery,ImportResult,ImportDraft,ImportBatch,ImportApproval,SystemReadiness,TenantRisk,TenantDetail,Overview,TicketHistoryEvent,TenantOnboardingChannel,TenantOnboarding} from '../../../../packages/contracts/src/read-models';
export type ManagerScreen =
  | "agenda"
  | "operations"
  | "dashboard"
  | "tenants"
  | "tenant-detail"
  | "tenant-add"
  | "objects"
  | "property-add"
  | "object-launch"
  | "units"
  | "unit-detail"
  | "unit-add"
  | "leases"
  | "lease-add"
  | "billing"
  | "tickets"
  | "ticket-detail"
  | "ticket-create"
  | "chat"
  | "notifications"
  | "staff"
  | "staff-add"
  | "import"
  | "profile";

export type TenantDetailTab =
  "info" | "contracts" | "payments" | "meters" | "notes" | "tickets" | "risks";

export type ChatThread = {
  tenantId: string;
  tenantName: string;
  propertyName: string | null;
  preview: string;
  lastActivity: string;
  unreadCount: number;
  ticketCount: number;
};

export type ChatMessage = {
  id: string;
  ticketId: string;
  ticketNumber: string;
  authorName: string;
  authorRole: string | null;
  sourceChannel: string;
  content: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
};

export type Section = (typeof navSections)[number];

export type TicketFilter = "all" | (typeof ticketStatusOptions)[number];

export type AdminPanel = "property" | "tenant" | "unit" | "lease";

export type PaymentStatus = TenantPayment["status"];
