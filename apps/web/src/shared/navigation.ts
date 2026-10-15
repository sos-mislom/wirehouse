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

export const managerNavGroups = [
  {
    label: "Работа",
    screens: ["dashboard", "agenda", "tickets", "operations"],
  },
  {
    label: "Аренда",
    screens: ["objects", "units", "tenants", "leases", "billing"],
  },
  { label: "Общение", screens: ["chat", "notifications"] },
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
