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

export const managerPrimaryNav = [
  "dashboard",
  "agenda",
  "tenants",
  "units",
  "leases",
  "billing",
  "tickets",
  "chat",
  "notifications",
] as const satisfies readonly ManagerScreen[];

export const managerSecondaryNav = [
  "operations",
  "objects",
  "staff",
  "import",
  "profile",
] as const satisfies readonly ManagerScreen[];
