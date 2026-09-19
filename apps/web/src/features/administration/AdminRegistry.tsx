import { useWorkspace } from "../../app/WorkspaceContext";
import { Button } from "../../ui";
export function AdminRegistry() {
  const {
    adminPanel,
    overview,
    startEditProperty,
    adminEditLabel,
    handleDelete,
    t,
    startEditTenant,
    startEditUnit,
    startEditLease,
  } = useWorkspace();

  if (adminPanel === "property") {
    return overview.properties.map((property) => (
      <div className="list-row" key={property.id}>
        <div>
          <strong>{property.name}</strong>
          <p>
            {property.address} · {property.warehouseClass}
          </p>
        </div>
        <div className="list-aside">
          <span>{property.rentableArea} м²</span>
          <Button
            variant="text"
            className="text-button"
            onClick={() => startEditProperty(property)}
            type="button"
          >
            {adminEditLabel}
          </Button>
          <Button
            variant="text"
            className="text-button text-button--danger"
            onClick={() => handleDelete(`/api/properties/${property.id}`)}
            type="button"
          >
            {t.actions.delete}
          </Button>
        </div>
      </div>
    ));
  }

  if (adminPanel === "tenant") {
    return overview.tenants.map((tenant) => (
      <div className="list-row" key={tenant.id}>
        <div>
          <strong>{tenant.name}</strong>
          <p>
            {tenant.contactName} ·{" "}
            {t.riskLevels[tenant.riskLevel as keyof typeof t.riskLevels]}
          </p>
        </div>
        <div className="list-aside">
          <span>{tenant.leaseCount}</span>
          <Button
            variant="text"
            className="text-button"
            onClick={() => startEditTenant(tenant)}
            type="button"
          >
            {adminEditLabel}
          </Button>
          <Button
            variant="text"
            className="text-button text-button--danger"
            onClick={() => handleDelete(`/api/tenants/${tenant.id}`)}
            type="button"
          >
            {t.actions.delete}
          </Button>
        </div>
      </div>
    ));
  }

  if (adminPanel === "unit") {
    return overview.units.map((unit) => (
      <div className="list-row" key={unit.id}>
        <div>
          <strong>
            {unit.propertyName} · {unit.number}
          </strong>
          <p>
            {t.unitTypes[unit.type as keyof typeof t.unitTypes]} · {unit.area}{" "}
            м²
          </p>
        </div>
        <div className="list-aside">
          <span className={`status-pill status-pill--${unit.status}`}>
            {t.unitStatuses[unit.status as keyof typeof t.unitStatuses]}
          </span>
          <Button
            variant="text"
            className="text-button"
            onClick={() => startEditUnit(unit)}
            type="button"
          >
            {adminEditLabel}
          </Button>
          <Button
            variant="text"
            className="text-button text-button--danger"
            onClick={() => handleDelete(`/api/units/${unit.id}`)}
            type="button"
          >
            {t.actions.delete}
          </Button>
        </div>
      </div>
    ));
  }

  return overview.leases.map((lease) => (
    <div className="list-row" key={lease.id}>
      <div>
        <strong>{lease.contractNumber}</strong>
        <p>
          {lease.tenantName} · {lease.unitNumber}
        </p>
      </div>
      <div className="list-aside">
        <span>{t.leaseStages[lease.stage as keyof typeof t.leaseStages]}</span>
        <Button
          variant="text"
          className="text-button"
          onClick={() => startEditLease(lease)}
          type="button"
        >
          {adminEditLabel}
        </Button>
        <Button
          variant="text"
          className="text-button text-button--danger"
          onClick={() => handleDelete(`/api/leases/${lease.id}`)}
          type="button"
        >
          {t.actions.delete}
        </Button>
      </div>
    </div>
  ));
}
