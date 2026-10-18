import { type ManagerScreen } from "./types";

export const documentCategoryOptions = [
  "lease",
  "appendix",
  "invoice",
  "act",
  "payment",
  "receipt",
  "other",
] as const;

export const TOKEN_KEY = "warehouse-platform-token";

export const navSections = [
  "overview",
  "portfolio",
  "leases",
  "service",
  "chat",
  "admin",
] as const;

export const managerMainNav = [
  "dashboard",
  "tickets",
  "objects",
  "billing",
  "chat",
] as const satisfies readonly ManagerScreen[];

export const managerExtraNavGroups = [
  { label: "Аренда", screens: ["units", "tenants", "leases"] },
  {
    label: "Работы и события",
    screens: ["agenda", "operations", "notifications"],
  },
  { label: "Управление", screens: ["staff", "import", "profile"] },
] as const satisfies readonly {
  label: string;
  screens: readonly ManagerScreen[];
}[];

export const managerMobileNav = [
  "dashboard",
  "tickets",
  "billing",
  "chat",
] as const;
