import { useWorkspace } from "../../app/WorkspaceContext";
import {
  leaseStageOptions,
  riskLevelOptions,
  unitStatusOptions,
  unitTypeOptions,
} from "../../projectData";
import { Button, Input, Select, Textarea } from "../../ui";
export function AdminForm() {
  const {
    adminPanel,
    submitAdminSave,
    propertyForm,
    resetPropertyForm,
    t,
    handleFieldChange,
    setPropertyForm,
    busyAction,
    editingAdmin,
    adminSaveChangesLabel,
    cancelAdminEdit,
    adminCancelLabel,
    tenantCreateForm,
    resetTenantCreateForm,
    setTenantCreateForm,
    unitForm,
    resetUnitForm,
    setUnitForm,
    overview,
    leaseForm,
    resetLeaseForm,
    setLeaseForm,
  } = useWorkspace();

  if (adminPanel === "property") {
    return (
      <form
        className="form-grid"
        onSubmit={(event) =>
          submitAdminSave(
            event,
            "property",
            "/api/properties",
            {
              ...propertyForm,
              totalArea: Number(propertyForm.totalArea),
              rentableArea: Number(propertyForm.rentableArea),
            },
            resetPropertyForm,
          )
        }
      >
        <label>
          <span>{t.fields.name}</span>
          <Input
            name="name"
            onChange={handleFieldChange(setPropertyForm)}
            value={propertyForm.name}
          />
        </label>
        <label>
          <span>{t.fields.address}</span>
          <Input
            name="address"
            onChange={handleFieldChange(setPropertyForm)}
            value={propertyForm.address}
          />
        </label>
        <label>
          <span>{t.fields.totalArea}</span>
          <Input
            name="totalArea"
            onChange={handleFieldChange(setPropertyForm)}
            type="number"
            value={propertyForm.totalArea}
          />
        </label>
        <label>
          <span>{t.fields.rentableArea}</span>
          <Input
            name="rentableArea"
            onChange={handleFieldChange(setPropertyForm)}
            type="number"
            value={propertyForm.rentableArea}
          />
        </label>
        <label>
          <span>{t.fields.warehouseClass}</span>
          <Select
            name="warehouseClass"
            onChange={handleFieldChange(setPropertyForm)}
            value={propertyForm.warehouseClass}
          >
            {t.warehouseClasses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <label className="full-width">
          <span>{t.fields.description}</span>
          <Textarea
            name="description"
            onChange={handleFieldChange(setPropertyForm)}
            rows={4}
            value={propertyForm.description}
          />
        </label>
        <Button
          variant="primary"
          className="primary-button"
          disabled={busyAction.startsWith("/api/properties")}
          type="submit"
        >
          {editingAdmin.property ? adminSaveChangesLabel : t.actions.save}
        </Button>
        {editingAdmin.property ? (
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => cancelAdminEdit("property")}
            type="button"
          >
            {adminCancelLabel}
          </Button>
        ) : null}
      </form>
    );
  }

  if (adminPanel === "tenant") {
    return (
      <form
        className="form-grid"
        onSubmit={(event) =>
          submitAdminSave(
            event,
            "tenant",
            "/api/tenants",
            tenantCreateForm,
            resetTenantCreateForm,
          )
        }
      >
        <label>
          <span>{t.fields.name}</span>
          <Input
            name="name"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.name}
          />
        </label>
        <label>
          <span>{t.fields.inn}</span>
          <Input
            name="inn"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.inn}
          />
        </label>
        <label>
          <span>{t.fields.contactName}</span>
          <Input
            name="contactName"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.contactName}
          />
        </label>
        <label>
          <span>{t.fields.phone}</span>
          <Input
            name="phone"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.phone}
          />
        </label>
        <label>
          <span>{t.fields.email}</span>
          <Input
            name="email"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.email}
          />
        </label>
        <label>
          <span>{t.fields.riskLevel}</span>
          <Select
            name="riskLevel"
            onChange={handleFieldChange(setTenantCreateForm)}
            value={tenantCreateForm.riskLevel}
          >
            {riskLevelOptions.map((option) => (
              <option key={option} value={option}>
                {t.riskLevels[option]}
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="primary"
          className="primary-button"
          disabled={busyAction.startsWith("/api/tenants")}
          type="submit"
        >
          {editingAdmin.tenant ? adminSaveChangesLabel : t.actions.save}
        </Button>
        {editingAdmin.tenant ? (
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => cancelAdminEdit("tenant")}
            type="button"
          >
            {adminCancelLabel}
          </Button>
        ) : null}
      </form>
    );
  }

  if (adminPanel === "unit") {
    return (
      <form
        className="form-grid"
        onSubmit={(event) =>
          submitAdminSave(
            event,
            "unit",
            "/api/units",
            {
              ...unitForm,
              floor: Number(unitForm.floor),
              area: Number(unitForm.area),
              ceilingHeight: Number(unitForm.ceilingHeight || 0),
            },
            resetUnitForm,
          )
        }
      >
        <label>
          <span>{t.fields.property}</span>
          <Select
            name="propertyId"
            onChange={handleFieldChange(setUnitForm)}
            value={unitForm.propertyId}
          >
            {overview.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>{t.fields.number}</span>
          <Input
            name="number"
            onChange={handleFieldChange(setUnitForm)}
            value={unitForm.number}
          />
        </label>
        <label>
          <span>Корпус</span>
          <Input
            name="building"
            value={unitForm.building}
            onChange={handleFieldChange(setUnitForm)}
            placeholder="Корпус А"
          />
        </label>
        <label>
          <span>Подъезд / секция</span>
          <Input
            name="entrance"
            value={unitForm.entrance}
            onChange={handleFieldChange(setUnitForm)}
            placeholder="Секция 1"
          />
        </label>
        <label>
          <span>Фото помещения (HTTPS)</span>
          <Input
            name="photoUrl"
            type="url"
            value={unitForm.photoUrl}
            onChange={handleFieldChange(setUnitForm)}
          />
        </label>
        <label>
          <span>{t.fields.floor}</span>
          <Input
            name="floor"
            onChange={handleFieldChange(setUnitForm)}
            type="number"
            value={unitForm.floor}
          />
        </label>
        <label>
          <span>{t.fields.area}</span>
          <Input
            name="area"
            onChange={handleFieldChange(setUnitForm)}
            type="number"
            value={unitForm.area}
          />
        </label>
        <label>
          <span>{t.fields.type}</span>
          <Select
            name="type"
            onChange={handleFieldChange(setUnitForm)}
            value={unitForm.type}
          >
            {unitTypeOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitTypes[option]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>{t.fields.status}</span>
          <Select
            name="status"
            onChange={handleFieldChange(setUnitForm)}
            value={unitForm.status}
          >
            {unitStatusOptions.map((option) => (
              <option key={option} value={option}>
                {t.unitStatuses[option]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>{t.fields.temperatureRegime}</span>
          <Input
            name="temperatureRegime"
            onChange={handleFieldChange(setUnitForm)}
            value={unitForm.temperatureRegime}
          />
        </label>
        <label>
          <span>{t.fields.ceilingHeight}</span>
          <Input
            name="ceilingHeight"
            onChange={handleFieldChange(setUnitForm)}
            type="number"
            value={unitForm.ceilingHeight}
          />
        </label>
        <label className="checkbox">
          <Input
            checked={unitForm.hasRamp}
            name="hasRamp"
            onChange={handleFieldChange(setUnitForm)}
            type="checkbox"
          />
          <span>{t.fields.hasRamp}</span>
        </label>
        <label className="checkbox">
          <Input
            checked={unitForm.hasGate}
            name="hasGate"
            onChange={handleFieldChange(setUnitForm)}
            type="checkbox"
          />
          <span>{t.fields.hasGate}</span>
        </label>
        <Button
          variant="primary"
          className="primary-button"
          disabled={busyAction.startsWith("/api/units")}
          type="submit"
        >
          {editingAdmin.unit ? adminSaveChangesLabel : t.actions.save}
        </Button>
        {editingAdmin.unit ? (
          <Button
            variant="secondary"
            className="secondary-button"
            onClick={() => cancelAdminEdit("unit")}
            type="button"
          >
            {adminCancelLabel}
          </Button>
        ) : null}
      </form>
    );
  }

  const editingLease =
    overview.leases.find((lease) => lease.id === editingAdmin.lease) ?? null;
  const availableLeaseUnits = overview.units;

  return (
    <form
      className="form-grid"
      onSubmit={(event) =>
        submitAdminSave(
          event,
          "lease",
          "/api/leases",
          {
            ...leaseForm,
            ratePerSqm: Number(leaseForm.ratePerSqm),
            deposit: Number(leaseForm.deposit),
            indexationPct: Number(leaseForm.indexationPct),
          },
          resetLeaseForm,
        )
      }
    >
      <p className="field-hint">
        Обязательны: арендатор, помещение, номер, стадия, даты и ставка
        договора.
      </p>
      <label>
        <span>{t.fields.tenant} *</span>
        <Select
          required
          name="tenantId"
          onChange={handleFieldChange(setLeaseForm)}
          value={leaseForm.tenantId}
        >
          {overview.tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span>{t.fields.unit}</span>
        <Select
          required
          name="unitId"
          onChange={handleFieldChange(setLeaseForm)}
          value={leaseForm.unitId}
        >
          {availableLeaseUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.propertyName} · {unit.number}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span>{t.fields.contractNumber}</span>
        <Input
          required
          name="contractNumber"
          onChange={handleFieldChange(setLeaseForm)}
          value={leaseForm.contractNumber}
        />
      </label>
      <label>
        <span>{t.fields.stage}</span>
        <Select
          name="stage"
          onChange={handleFieldChange(setLeaseForm)}
          value={leaseForm.stage}
        >
          {leaseStageOptions.map((option) => (
            <option key={option} value={option}>
              {t.leaseStages[option]}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span>{t.fields.startDate}</span>
        <Input
          required
          name="startDate"
          onChange={handleFieldChange(setLeaseForm)}
          type="date"
          value={leaseForm.startDate}
        />
      </label>
      <label>
        <span>{t.fields.endDate}</span>
        <Input
          required
          name="endDate"
          onChange={handleFieldChange(setLeaseForm)}
          type="date"
          value={leaseForm.endDate}
        />
      </label>
      <label>
        <span>{t.fields.ratePerSqm}</span>
        <Input
          required
          name="ratePerSqm"
          onChange={handleFieldChange(setLeaseForm)}
          type="number"
          value={leaseForm.ratePerSqm}
        />
      </label>
      <label>
        <span>{t.fields.deposit}</span>
        <Input
          name="deposit"
          onChange={handleFieldChange(setLeaseForm)}
          type="number"
          value={leaseForm.deposit}
        />
      </label>
      <label>
        <span>{t.fields.indexationPct} в год</span>
        <Input
          name="indexationPct"
          onChange={handleFieldChange(setLeaseForm)}
          type="number"
          value={leaseForm.indexationPct}
          min="0"
          max="100"
          step="0.01"
        />
        <small className="field-hint">
          Необязательно: 0 — без индексации. Годовой процент фиксируется в
          договоре; изменение ставки и начислений подтверждает менеджер вручную.
        </small>
      </label>
      <Button
        variant="primary"
        className="primary-button"
        disabled={busyAction.startsWith("/api/leases")}
        type="submit"
      >
        {editingAdmin.lease ? adminSaveChangesLabel : t.actions.save}
      </Button>
      {editingAdmin.lease ? (
        <Button
          variant="secondary"
          className="secondary-button"
          onClick={() => cancelAdminEdit("lease")}
          type="button"
        >
          {adminCancelLabel}
        </Button>
      ) : null}
    </form>
  );
}
