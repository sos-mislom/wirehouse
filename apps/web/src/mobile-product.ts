export const mobileProduct = import.meta.env.VITE_WAREHOUSE_PRODUCT as
  "client" | "worker" | undefined;
export function assertProductRole(role: string) {
  if (
    mobileProduct &&
    role !== (mobileProduct === "client" ? "tenant" : "worker")
  )
    throw Object.assign(
      new Error(
        mobileProduct === "client"
          ? "Для приложения клиента нужна учетная запись собственника или арендатора"
          : "Для приложения исполнителя нужна учетная запись исполнителя",
      ),
      { code: "PRODUCT_ROLE_MISMATCH" },
    );
}
