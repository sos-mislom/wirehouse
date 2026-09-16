export const CLOSED_TICKET_STATUSES: Set<string>;
export const MAX_ATTACHMENT_BYTES: number;
export function isOpenTicket(status: string): boolean;
export function isCriticalTicket(ticket: { status: string; priority: string }): boolean;
export function slaState(ticket: {status: string; slaDueAt?: string | null} | null, now?: number): {state: string; hours: number};
export function requireNumber(value: unknown, label: string, min?: number, max?: number): number;
export function requireDate(value: unknown, label: string): string;
export function leaseOverlaps(a: any, b: any): boolean;
