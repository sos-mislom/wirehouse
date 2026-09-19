import { useRef, useState } from "react";
import { initialRoute } from "../navigation";
import { type OperationsData } from "../Operations";
import { documentCategoryOptions } from "../shared/navigation";
import {
  type AdminPanel,
  type BillingInvoice,
  type BillingReconciliation,
  type ChatMessage,
  type ChecklistTemplate,
  type ImportApproval,
  type ImportBatch,
  type ImportDraft,
  type ImportResult,
  type Lease,
  type LeaseDocument,
  type ManagerScreen,
  type Overview,
  type Section,
  type SessionUser,
  type SystemReadiness,
  type TenantDetail,
  type TenantDetailTab,
  type TenantOnboarding,
  type Ticket,
  type TicketAttachment,
  type TicketComment,
  type TicketFilter,
  type TicketHistoryEvent,
} from "../shared/types";

export function useWorkspaceState() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const [session, setSession] = useState<{
    token: string;
    user: SessionUser;
  } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<
    TicketAttachment[]
  >([]);
  const [checklistTemplates, setChecklistTemplates] = useState<
    ChecklistTemplate[]
  >([]);
  const [selectedSection, setSelectedSection] = useState<Section>(
    (initialRoute.section as Section) || "overview",
  );
  const [managerScreen, setManagerScreen] = useState<ManagerScreen>(
    (initialRoute.screen as ManagerScreen) || "dashboard",
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialRoute.property || "",
  );
  const [selectedTenantId, setSelectedTenantId] = useState(
    initialRoute.tenant || "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(initialRoute.unit || "");
  const [selectedTicketId, setSelectedTicketId] = useState(
    initialRoute.ticket || "",
  );
  const [selectedChatTicketId, setSelectedChatTicketId] = useState("");
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoice[]>([]);
  const [billingReconciliation, setBillingReconciliation] =
    useState<BillingReconciliation | null>(null);
  const [selectedBillingInvoiceId, setSelectedBillingInvoiceId] = useState("");
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [tenantDetailTab, setTenantDetailTab] = useState<TenantDetailTab>(
    (initialRoute.tab as TenantDetailTab) || "info",
  );
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("all");
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryEvent[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantRiskFilter, setTenantRiskFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState("all");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [unitRampFilter, setUnitRampFilter] = useState("all");
  const [leaseStageFilter, setLeaseStageFilter] = useState("all");
  const [leaseTermFilter, setLeaseTermFilter] = useState("all");
  const [ticketStatusDraft, setTicketStatusDraft] = useState<string>("new");
  const [ticketAssigneeDraft, setTicketAssigneeDraft] = useState("");
  const [adminPanel, setAdminPanel] = useState<AdminPanel>("property");
  const [editingAdmin, setEditingAdmin] = useState<
    Record<AdminPanel, string | null>
  >({
    property: initialRoute.editProperty || null,
    tenant: initialRoute.editTenant || null,
    unit: initialRoute.editUnit || null,
    lease: initialRoute.editLease || null,
  });
  const [bootstrapping, setBootstrapping] = useState(true);
  const [tenantConnectionOpen, setTenantConnectionOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"staff" | "tenant">("staff");
  const [tenantOtpRequested, setTenantOtpRequested] = useState(false);
  const [staffAuthStep, setStaffAuthStep] = useState<
    "password" | "mfa" | "reset-request" | "reset-confirm"
  >("password");
  const [mfaToken, setMfaToken] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [tenantOnboarding, setTenantOnboarding] =
    useState<TenantOnboarding | null>(null);
  const [tenantDetailBusy, setTenantDetailBusy] = useState(false);
  const [selectedChatTenantId, setSelectedChatTenantId] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const editReturnScreen = useRef<ManagerScreen>(
    (initialRoute.returnScreen as ManagerScreen) || "dashboard",
  );
  const [operations, setOperations] = useState<OperationsData | null>(null);
  const [ticketView, setTicketView] = useState<"board" | "table">("board");
  const hydratedEdit = useRef("");
  const [staffForm, setStaffForm] = useState({
    email: "",
    password: "",
  });
  const [staffMfaForm, setStaffMfaForm] = useState({
    code: "",
  });
  const [resetForm, setResetForm] = useState({
    email: "",
    code: "",
    password: "",
  });
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    code: string;
    password: string;
  } | null>(null);
  const [tenantForm, setTenantForm] = useState({
    phone: "",
    otp: "",
  });
  const [propertyForm, setPropertyForm] = useState({
    name: "",
    address: "",
    totalArea: "",
    rentableArea: "",
    warehouseClass: "A",
    description: "",
  });
  const [tenantCreateForm, setTenantCreateForm] = useState({
    name: "",
    inn: "",
    contactName: "",
    phone: "",
    email: "",
    riskLevel: "medium",
  });
  const [unitForm, setUnitForm] = useState({
    propertyId: "",
    building: "",
    entrance: "",
    photoUrl: "",
    number: "",
    floor: "1",
    area: "",
    type: "warm",
    status: "vacant",
    temperatureRegime: "",
    ceilingHeight: "",
    hasRamp: true,
    hasGate: true,
  });
  const [unitSplitForm, setUnitSplitForm] = useState({
    number: "",
    area: "",
  });
  const [leaseForm, setLeaseForm] = useState({
    tenantId: "",
    unitId: "",
    contractNumber: "",
    stage: "draft",
    startDate: "",
    endDate: "",
    ratePerSqm: "",
    deposit: "0",
    indexationPct: "0",
  });
  const [ticketForm, setTicketForm] = useState({
    unitId: "",
    category: "maintenance",
    priority: "medium",
    title: "",
    description: "",
  });
  const [commentForm, setCommentForm] = useState({
    content: "",
  });
  const [tenantNoteForm, setTenantNoteForm] = useState({
    title: "",
    content: "",
  });
  const [tenantNoteFile, setTenantNoteFile] = useState<File | null>(null);
  const [expandedTenantNoteIds, setExpandedTenantNoteIds] = useState<
    Record<string, boolean>
  >({});
  const [chatDraft, setChatDraft] = useState({
    content: "",
  });
  const [billingPaymentForm, setBillingPaymentForm] = useState({
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    method: "bank_transfer",
    reference: "",
  });
  const [meterReadingForm, setMeterReadingForm] = useState({
    unitId: "",
    period: new Date().toISOString().slice(0, 7),
    meterType: "power",
    value: "",
    previousValue: "",
    tariffRate: "",
  });
  const [paymentProofForm, setPaymentProofForm] = useState({
    leaseId: "",
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    reference: "",
  });
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [documentPanelLease, setDocumentPanelLease] = useState<Lease | null>(
    null,
  );
  const [leaseDocuments, setLeaseDocuments] = useState<LeaseDocument[]>([]);
  const [documentUploadCategory, setDocumentUploadCategory] =
    useState<(typeof documentCategoryOptions)[number]>("lease");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
  const [importMode, setImportMode] = useState<"create" | "update" | "upsert">(
    "create",
  );
  const [importApprovals, setImportApprovals] = useState<ImportApproval[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [systemReadiness, setSystemReadiness] =
    useState<SystemReadiness | null>(null);
  const [staffCreateForm, setStaffCreateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "worker",
    propertyId: "",
  });
  const [launchForm, setLaunchForm] = useState({
    propertyName: "",
    address: "",
    totalArea: "",
    rentableArea: "",
    warehouseClass: "A",
    unitNumber: "",
    floor: "1",
    unitArea: "",
    unitType: "warm",
    temperatureRegime: "",
    ceilingHeight: "",
    tenantName: "",
    inn: "",
    contactName: "",
    phone: "",
    email: "",
    riskLevel: "medium",
    contractNumber: "",
    startDate: "",
    endDate: "",
    ratePerSqm: "",
    deposit: "0",
  });
  return {
    mobileNavOpen,
    setMobileNavOpen,
    mobileMenuButton,
    session,
    setSession,
    overview,
    setOverview,
    tickets,
    setTickets,
    ticketComments,
    setTicketComments,
    ticketAttachments,
    setTicketAttachments,
    checklistTemplates,
    setChecklistTemplates,
    selectedSection,
    setSelectedSection,
    managerScreen,
    setManagerScreen,
    selectedPropertyId,
    setSelectedPropertyId,
    selectedTenantId,
    setSelectedTenantId,
    selectedUnitId,
    setSelectedUnitId,
    selectedTicketId,
    setSelectedTicketId,
    selectedChatTicketId,
    setSelectedChatTicketId,
    billingInvoices,
    setBillingInvoices,
    billingReconciliation,
    setBillingReconciliation,
    selectedBillingInvoiceId,
    setSelectedBillingInvoiceId,
    tenantDetail,
    setTenantDetail,
    tenantDetailTab,
    setTenantDetailTab,
    ticketFilter,
    setTicketFilter,
    ticketHistory,
    setTicketHistory,
    tenantSearch,
    setTenantSearch,
    tenantRiskFilter,
    setTenantRiskFilter,
    unitTypeFilter,
    setUnitTypeFilter,
    unitStatusFilter,
    setUnitStatusFilter,
    unitRampFilter,
    setUnitRampFilter,
    leaseStageFilter,
    setLeaseStageFilter,
    leaseTermFilter,
    setLeaseTermFilter,
    ticketStatusDraft,
    setTicketStatusDraft,
    ticketAssigneeDraft,
    setTicketAssigneeDraft,
    adminPanel,
    setAdminPanel,
    editingAdmin,
    setEditingAdmin,
    bootstrapping,
    setBootstrapping,
    tenantConnectionOpen,
    setTenantConnectionOpen,
    authMode,
    setAuthMode,
    tenantOtpRequested,
    setTenantOtpRequested,
    staffAuthStep,
    setStaffAuthStep,
    mfaToken,
    setMfaToken,
    notice,
    setNotice,
    error,
    setError,
    busyAction,
    setBusyAction,
    tenantOnboarding,
    setTenantOnboarding,
    tenantDetailBusy,
    setTenantDetailBusy,
    selectedChatTenantId,
    setSelectedChatTenantId,
    chatMessages,
    setChatMessages,
    chatBusy,
    setChatBusy,
    editReturnScreen,
    operations,
    setOperations,
    ticketView,
    setTicketView,
    hydratedEdit,
    staffForm,
    setStaffForm,
    staffMfaForm,
    setStaffMfaForm,
    resetForm,
    setResetForm,
    totpSetup,
    setTotpSetup,
    tenantForm,
    setTenantForm,
    propertyForm,
    setPropertyForm,
    tenantCreateForm,
    setTenantCreateForm,
    unitForm,
    setUnitForm,
    unitSplitForm,
    setUnitSplitForm,
    leaseForm,
    setLeaseForm,
    ticketForm,
    setTicketForm,
    commentForm,
    setCommentForm,
    tenantNoteForm,
    setTenantNoteForm,
    tenantNoteFile,
    setTenantNoteFile,
    expandedTenantNoteIds,
    setExpandedTenantNoteIds,
    chatDraft,
    setChatDraft,
    billingPaymentForm,
    setBillingPaymentForm,
    meterReadingForm,
    setMeterReadingForm,
    paymentProofForm,
    setPaymentProofForm,
    paymentProofFile,
    setPaymentProofFile,
    documentPanelLease,
    setDocumentPanelLease,
    leaseDocuments,
    setLeaseDocuments,
    documentUploadCategory,
    setDocumentUploadCategory,
    importResults,
    setImportResults,
    importDrafts,
    setImportDrafts,
    importMode,
    setImportMode,
    importApprovals,
    setImportApprovals,
    importBatches,
    setImportBatches,
    systemReadiness,
    setSystemReadiness,
    staffCreateForm,
    setStaffCreateForm,
    launchForm,
    setLaunchForm,
  };
}
export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
