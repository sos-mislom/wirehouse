import {
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { apiRequest } from "../../api/client";
import { formatArea } from "../../shared/format";
import {
  type AdminPanel,
  type Lease,
  type Property,
  type Tenant,
  type Unit,
} from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
export function usePortfolioActions(
  deps: Pick<
    WorkspaceBase,
    | "setPropertyForm"
    | "setTenantCreateForm"
    | "setUnitForm"
    | "setLeaseForm"
    | "setLaunchForm"
    | "editingAdmin"
    | "isManagerShell"
    | "managerScreen"
    | "setManagerScreen"
    | "editReturnScreen"
    | "setEditingAdmin"
    | "setAdminPanel"
    | "session"
    | "setBusyAction"
    | "setError"
    | "setNotice"
    | "t"
    | "selectedUnit"
    | "canManagePortfolio"
    | "unitSplitForm"
    | "setSelectedUnitId"
    | "locale"
    | "staffCreateForm"
    | "setStaffCreateForm"
    | "launchForm"
    | "setSelectedPropertyId"
    | "setSelectedTenantId"
  > &
    Pick<ReturnType<typeof useDataActions>, "refreshWorkspace">,
) {
  const {
    setPropertyForm,
    setTenantCreateForm,
    setUnitForm,
    setLeaseForm,
    setLaunchForm,
    editingAdmin,
    isManagerShell,
    managerScreen,
    setManagerScreen,
    editReturnScreen,
    setEditingAdmin,
    setAdminPanel,
    session,
    setBusyAction,
    setError,
    setNotice,
    t,
    refreshWorkspace,
    selectedUnit,
    canManagePortfolio,
    unitSplitForm,
    setSelectedUnitId,
    locale,
    staffCreateForm,
    setStaffCreateForm,
    launchForm,
    setSelectedPropertyId,
    setSelectedTenantId,
  } = deps;
  const handleFieldChange =
    <T extends Record<string, string | boolean>>(
      setter: Dispatch<SetStateAction<T>>,
    ) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      const target = event.target;
      const nextValue =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;

      setter((current) => ({
        ...current,
        [target.name]: nextValue,
      }));
    };

  const resetPropertyForm = () =>
    setPropertyForm({
      name: "",
      address: "",
      totalArea: "",
      rentableArea: "",
      warehouseClass: "A",
      description: "",
    });

  const resetTenantCreateForm = () =>
    setTenantCreateForm({
      name: "",
      inn: "",
      contactName: "",
      phone: "",
      email: "",
      riskLevel: "medium",
    });

  const resetUnitForm = () =>
    setUnitForm((current) => ({
      ...current,
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
    }));

  const resetLeaseForm = () =>
    setLeaseForm((current) => ({
      ...current,
      contractNumber: "",
      startDate: "",
      endDate: "",
      ratePerSqm: "",
      deposit: "0",
      indexationPct: "0",
      stage: "draft",
    }));

  const resetLaunchForm = () =>
    setLaunchForm({
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

  const cancelAdminEdit = (panel: AdminPanel) => {
    if (editingAdmin[panel] && isManagerShell && managerScreen.endsWith("-add"))
      setManagerScreen(editReturnScreen.current);
    setEditingAdmin((current) => ({
      ...current,
      [panel]: null,
    }));

    if (panel === "property") {
      resetPropertyForm();
    } else if (panel === "tenant") {
      resetTenantCreateForm();
    } else if (panel === "unit") {
      resetUnitForm();
    } else {
      resetLeaseForm();
    }
  };

  const startEditProperty = (property: Property) => {
    setAdminPanel("property");
    setEditingAdmin((current) => ({
      ...current,
      property: property.id,
    }));
    setPropertyForm({
      name: property.name,
      address: property.address,
      totalArea: String(property.totalArea),
      rentableArea: String(property.rentableArea),
      warehouseClass: property.warehouseClass,
      description: property.description ?? "",
    });
  };

  const startEditTenant = (tenant: Tenant) => {
    setAdminPanel("tenant");
    setEditingAdmin((current) => ({
      ...current,
      tenant: tenant.id,
    }));
    setTenantCreateForm({
      name: tenant.name,
      inn: tenant.inn,
      contactName: tenant.contactName,
      phone: tenant.phone,
      email: tenant.email,
      riskLevel: tenant.riskLevel,
    });
  };

  const startEditUnit = (unit: Unit) => {
    setAdminPanel("unit");
    setEditingAdmin((current) => ({
      ...current,
      unit: unit.id,
    }));
    setUnitForm({
      propertyId: unit.propertyId,
      building: unit.building ?? "",
      entrance: unit.entrance ?? "",
      photoUrl: unit.photoUrl ?? "",
      number: unit.number,
      floor: String(unit.floor),
      area: String(unit.area),
      type: unit.type,
      status: unit.status,
      temperatureRegime: unit.temperatureRegime ?? "",
      ceilingHeight: unit.ceilingHeight ? String(unit.ceilingHeight) : "",
      hasRamp: unit.hasRamp,
      hasGate: unit.hasGate,
    });
  };

  const startEditLease = (lease: Lease) => {
    setAdminPanel("lease");
    setEditingAdmin((current) => ({
      ...current,
      lease: lease.id,
    }));
    setLeaseForm({
      tenantId: lease.tenantId,
      unitId: lease.unitId,
      contractNumber: lease.contractNumber,
      stage: lease.stage,
      startDate: lease.startDate,
      endDate: lease.endDate,
      ratePerSqm: String(lease.ratePerSqm),
      deposit: String(lease.deposit),
      indexationPct: String(lease.indexationPct),
    });
  };

  const openManagerPropertyEdit = (property: Property) => {
    editReturnScreen.current = managerScreen;
    startEditProperty(property);
    setManagerScreen("property-add");
  };

  const openManagerTenantEdit = (tenant: Tenant) => {
    editReturnScreen.current = managerScreen;
    startEditTenant(tenant);
    setManagerScreen("tenant-add");
  };

  const openManagerUnitEdit = (unit: Unit) => {
    editReturnScreen.current = managerScreen;
    startEditUnit(unit);
    setManagerScreen("unit-add");
  };

  const openManagerLeaseEdit = (lease: Lease) => {
    editReturnScreen.current = managerScreen;
    startEditLease(lease);
    setManagerScreen("lease-add");
  };

  const submitAdminSave = async (
    event: FormEvent,
    panel: AdminPanel,
    createPath: string,
    body: Record<string, unknown>,
    reset: () => void,
    afterSuccess?: () => void,
  ) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const editingId = editingAdmin[panel];
    const path = editingId ? `${createPath}/${editingId}` : createPath;

    setBusyAction(path);
    setError("");

    try {
      await apiRequest(path, {
        method: editingId ? "PUT" : "POST",
        token: session.token,
        body,
      });
      reset();
      setEditingAdmin((current) => ({
        ...current,
        [panel]: null,
      }));
      afterSuccess?.();
      setNotice(t.messages.saved);
      await refreshWorkspace();
      if (
        isManagerShell &&
        ["property-add", "tenant-add", "unit-add", "lease-add"].includes(
          managerScreen,
        )
      ) {
        setManagerScreen(
          panel === "property"
            ? "objects"
            : panel === "tenant"
              ? "tenants"
              : panel === "unit"
                ? "units"
                : "leases",
        );
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Save failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async (path: string) => {
    if (!session || !window.confirm(t.actions.confirmDelete)) {
      return;
    }

    setBusyAction(path);
    setError("");

    try {
      await apiRequest(path, {
        method: "DELETE",
        token: session.token,
      });
      setNotice(t.messages.deleted);
      await refreshWorkspace();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Delete failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleUnitSplitSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedUnit || !canManagePortfolio) {
      return;
    }

    setBusyAction(`unit-split-${selectedUnit.id}`);
    setError("");

    try {
      const result = await apiRequest<{ item: Unit; original: Unit }>(
        `/api/units/${selectedUnit.id}/split`,
        {
          method: "POST",
          token: session.token,
          body: {
            number: unitSplitForm.number,
            area: Number(unitSplitForm.area),
          },
        },
      );
      await refreshWorkspace();
      setSelectedUnitId(result.item.id);
      setManagerScreen("unit-detail");
      setNotice(
        locale === "ru"
          ? `Помещение разделено: создано ${result.item.number}, исходная площадь ${formatArea(result.original.area, locale)}`
          : `Unit split: ${result.item.number} created`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unit split failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleCreateStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusyAction("staff-create");
    setError("");

    try {
      await apiRequest("/api/users", {
        method: "POST",
        token: session.token,
        body: {
          ...staffCreateForm,
          propertyId:
            staffCreateForm.role === "admin"
              ? null
              : staffCreateForm.propertyId,
        },
      });
      setStaffCreateForm((current) => ({
        ...current,
        fullName: "",
        email: "",
        phone: "",
        password: "",
        role: "worker",
      }));
      setNotice(t.messages.saved);
      setManagerScreen("staff");
      await refreshWorkspace();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Staff create failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleLaunchObject = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusyAction("object-launch");
    setError("");

    try {
      const propertyResult = await apiRequest<{ item: Property }>(
        "/api/properties",
        {
          method: "POST",
          token: session.token,
          body: {
            name: launchForm.propertyName,
            address: launchForm.address,
            totalArea: Number(launchForm.totalArea),
            rentableArea: Number(launchForm.rentableArea),
            warehouseClass: launchForm.warehouseClass,
            description:
              locale === "ru"
                ? "Создано мастером запуска объекта"
                : "Created by object launch wizard",
          },
        },
      );

      const unitResult = await apiRequest<{ item: Unit }>("/api/units", {
        method: "POST",
        token: session.token,
        body: {
          propertyId: propertyResult.item.id,
          number: launchForm.unitNumber,
          floor: launchForm.floor,
          area: Number(launchForm.unitArea),
          type: launchForm.unitType,
          status: "vacant",
          temperatureRegime: launchForm.temperatureRegime,
          ceilingHeight: Number(launchForm.ceilingHeight || 0),
          hasRamp: true,
          hasGate: true,
        },
      });

      const tenantResult = await apiRequest<{ item: Tenant }>("/api/tenants", {
        method: "POST",
        token: session.token,
        body: {
          name: launchForm.tenantName,
          inn: launchForm.inn,
          contactName: launchForm.contactName,
          phone: launchForm.phone,
          email: launchForm.email,
          riskLevel: launchForm.riskLevel,
        },
      });

      const leaseResult = await apiRequest<{ item: Lease }>("/api/leases", {
        method: "POST",
        token: session.token,
        body: {
          tenantId: tenantResult.item.id,
          unitId: unitResult.item.id,
          contractNumber: launchForm.contractNumber,
          stage: "active",
          startDate: launchForm.startDate,
          endDate: launchForm.endDate,
          ratePerSqm: Number(launchForm.ratePerSqm),
          deposit: Number(launchForm.deposit || 0),
          indexationPct: 0,
        },
      });

      resetLaunchForm();
      setSelectedPropertyId(propertyResult.item.id);
      setSelectedUnitId(unitResult.item.id);
      setSelectedTenantId(tenantResult.item.id);
      setNotice(
        locale === "ru"
          ? "Объект запущен: создан объект, помещение, арендатор и договор"
          : "Object launched",
      );
      await refreshWorkspace();
      setManagerScreen("unit-detail");
      void leaseResult;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Object launch failed",
      );
    } finally {
      setBusyAction("");
    }
  };
  return {
    handleFieldChange,
    resetPropertyForm,
    resetTenantCreateForm,
    resetUnitForm,
    resetLeaseForm,
    resetLaunchForm,
    cancelAdminEdit,
    startEditProperty,
    startEditTenant,
    startEditUnit,
    startEditLease,
    openManagerPropertyEdit,
    openManagerTenantEdit,
    openManagerUnitEdit,
    openManagerLeaseEdit,
    submitAdminSave,
    handleDelete,
    handleUnitSplitSubmit,
    handleCreateStaff,
    handleLaunchObject,
  };
}
