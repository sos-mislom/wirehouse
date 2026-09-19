export type AgendaKind =
  "lease" | "payment" | "maintenance" | "ticket" | "warranty";
export type RenewalStatus = "pending" | "contacted" | "renewing" | "leaving";
export interface RenewalDto {
  status: RenewalStatus;
  note: string;
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
}
export interface AgendaItemDto {
  id: string;
  kind: AgendaKind;
  entityId: string;
  title: string;
  date: string;
  daysLeft: number;
  overdue: boolean;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitNumber: string | null;
  tenantName: string | null;
  amount: number | null;
  renewal: RenewalDto | null;
}
export interface AgendaDto {
  asOf: string;
  until: string;
  items: AgendaItemDto[];
  counts: Record<AgendaKind, number>;
}
