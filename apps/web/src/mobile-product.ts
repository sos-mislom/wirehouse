export type MobileRole = "admin" | "manager" | "worker" | "tenant";

const knownRoles: readonly MobileRole[] = [
  "tenant",
  "worker",
  "manager",
  "admin",
];

// Set only by apps/mobile/scripts/prepare.mjs; a plain web build leaves it
// empty and every role keeps its normal browser workspace.
export const mobileRoles: readonly MobileRole[] = String(
  import.meta.env.VITE_WAREHOUSE_MOBILE_ROLES ?? "",
)
  .split(",")
  .map((role) => role.trim())
  .filter((role): role is MobileRole =>
    knownRoles.includes(role as MobileRole),
  );

export const isMobileApp = mobileRoles.length > 0;

export const isRoleAllowedInApp = (role: string) =>
  !isMobileApp || mobileRoles.includes(role as MobileRole);

// Tenants sign in by phone; every other role signs in with a password.
export const mobileAllowsPhoneLogin = mobileRoles.includes("tenant");
export const mobileAllowsPasswordLogin = mobileRoles.some(
  (role) => role !== "tenant",
);

// Owners sign in with the tenant role, so it names both audiences.
const audienceLabels: Record<MobileRole, string[]> = {
  tenant: ["собственника", "арендатора"],
  worker: ["исполнителя"],
  manager: ["управляющего"],
  admin: ["администратора"],
};

export const mobileAudience = mobileRoles.length
  ? `Кабинет ${new Intl.ListFormat("ru", { type: "conjunction" }).format(
      knownRoles
        .filter((role) => mobileRoles.includes(role))
        .flatMap((role) => audienceLabels[role]),
    )}`
  : "";

export function assertProductRole(role: string) {
  if (!isRoleAllowedInApp(role))
    throw Object.assign(
      new Error(
        "Эта учетная запись не используется в мобильном приложении. Войдите через веб-версию.",
      ),
      { code: "PRODUCT_ROLE_MISMATCH" },
    );
}
