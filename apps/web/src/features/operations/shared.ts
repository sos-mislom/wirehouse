import { apiRequest } from "../../api/client";
import type { Permission } from "../../../../../packages/contracts/src/permissions";
export const tabPermission: Record<string, Permission> = {
  equipment: "equipment.write",
  plans: "maintenance.write",
  services: "services.write",
  meters: "meters.write",
  news: "news.write",
  expenses: "expenses.write",
  users: "users.manage",
};
export type Row = {
  id: string;
  propertyId?: string;
  name?: string;
  [key: string]: any;
};

export type Unit = {
  floorId?: string;
  id: string;
  propertyId: string;
  number: string;
  floor: number;
  building?: string;
  entrance?: string;
  area: number;
  status: string;
  tenantName?: string | null;
  photoUrl?: string;
};

export type Ticket = {
  id: string;
  unitId: string;
  title: string;
  status: string;
  number: string;
  equipmentId?: string | null;
  serviceId?: string | null;
  leaseId?: string | null;
  maintenancePlanId?: string | null;
  workLogs?: Row[];
  assignedToName?: string | null;
  createdAt?: string;
};

export type Overview = {
  properties: { id: string; name: string }[];
  units: Unit[];
  leases?: {
    id: string;
    unitId: string;
    tenantId: string;
    contractNumber: string;
    stage: string;
  }[];
  tenants?: { id: string; name: string }[];
};

export type OperationsData = {
  equipment: Row[];
  services: Row[];
  plans: Row[];
  meters: Row[];
  news: Row[];
  expenses: Row[];
  readings: Row[];
  users: Row[];
  audit: Row[];
  floorplans: Row[];
};

export const emptyData: OperationsData = {
  equipment: [],
  services: [],
  plans: [],
  meters: [],
  news: [],
  expenses: [],
  readings: [],
  users: [],
  audit: [],
  floorplans: [],
};

export const specialtyNames: Record<string, string> = {
  plumber: "Сантехник",
  electrician: "Электрик",
  technician: "Техник",
  builder: "Строитель",
  cleaner: "Уборщик",
  contractor: "Подрядчик",
  engineer: "Инженер",
  dispatcher: "Диспетчер",
};

export const roleNames: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  worker: "Исполнитель",
  tenant: "Арендатор",
};

export const statusNames: Record<string, string> = {
  active: "В эксплуатации",
  maintenance: "На обслуживании",
  retired: "Списано",
  new: "Новая",
  accepted: "Принята",
  in_progress: "В работе",
  completed: "Выполнена",
  closed: "Закрыта",
  resolved: "Решена",
  rejected: "Отменена",
  waiting_tenant: "Ожидание",
  deferred: "Отложена",
};

export const resourceNames: Record<string, string> = {
  electricity: "Электричество",
  water: "Вода",
  heating: "Отопление",
};

export const currency = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value || 0);

export const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString("ru-RU") : "—";

export async function request<T>(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return apiRequest<T>(path, { token, method, body });
}

export const tabs: Record<string, string> = {
  estimates: "Сметы и акты",
  templates: "Регламенты",
  materials: "Материалы",
  contractors: "Подрядчики",
  equipment: "Оборудование",
  plans: "ППР",
  services: "Услуги",
  meters: "Счётчики",
  news: "Объявления",
  expenses: "Расходы",
  users: "Пользователи",
  audit: "Аудит",
};

export type Props = {
  token: string;
  user: { role: string; id: string; permissions?: string[] };
  overview: Overview;
  tickets: Ticket[];
  onRefresh: () => Promise<unknown>;
  onUnit: (id: string) => void;
  onTicket: (id: string) => void;
  initialTab?: string;
  onCreateUser?: () => void;
};

export function auditLabel(action: string) {
  return (
    (
      {
        user_updated: "Изменён пользователь",
        user_created: "Создан пользователь",
        created: "Добавлена запись",
        updated: "Изменена запись",
        reading_added: "Внесено показание",
        work_logged: "Учтены работы",
      } as Record<string, string>
    )[action] || action
  );
}

export type TicketProps = {
  token: string;
  ticket: Ticket;
  overview: Overview;
  operations: OperationsData | null;
  onRefresh: () => Promise<unknown>;
  onUnit: (id: string) => void;
  onTenant: (id: string) => void;
  onTicket: (id: string) => void;
  tickets: Ticket[];
  readOnly?: boolean;
  canEditLinks?: boolean;
};
