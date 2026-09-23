export const permissionLabels = {
  "workspace.read": "Просмотр рабочего пространства",
  "portfolio.write": "Объекты, помещения и арендаторы",
  "leases.write": "Договоры и документы",
  "tickets.write": "Создание и обработка заявок",
  "billing.write": "Счета и оплаты",
  "equipment.write": "Оборудование",
  "plans.write": "Планы и структура зданий",
  "maintenance.write": "Регламенты и графики ППР",
  "services.write": "Услуги, материалы и подрядчики",
  "estimates.write": "Подготовка смет",
  "estimates.approve": "Согласование смет и выпуск актов",
  "meters.write": "Счётчики и показания",
  "news.write": "Объявления",
  "expenses.write": "Расходы",
  "users.manage": "Управление сотрудниками",
  "permissions.manage": "Назначение прав доступа",
  "audit.read": "Журнал всех изменений",
  "imports.write": "Импорт данных",
} as const;
export type Permission = keyof typeof permissionLabels;
export const permissionKeys = Object.keys(permissionLabels) as Permission[];
export const rolePermissions: Record<string, Permission[]> = {
  admin: permissionKeys,
  manager: permissionKeys.filter(
    (p) => !["permissions.manage", "audit.read"].includes(p),
  ),
  worker: ["workspace.read", "tickets.write", "meters.write"],
  tenant: ["workspace.read", "tickets.write"],
};
type Subject = { role: string; permissions?: string[] | null };
export function permissionsFor(user: Subject): Permission[] {
  const ceiling = rolePermissions[user.role] ?? [];
  return user.permissions == null
    ? ceiling
    : ceiling.filter((p) => user.permissions!.includes(p));
}
export const hasPermission = (user: Subject, permission: Permission) =>
  permissionsFor(user).includes(permission);
