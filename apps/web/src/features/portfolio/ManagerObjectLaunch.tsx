import { useWorkspace } from "../../app/WorkspaceContext";
import { unitTypeOptions } from "../../projectData";
import { Button, Input, Select } from "../../ui";
export function ManagerObjectLaunch() {
  const {
    setManagerScreen,
    managerUi,
    handleLaunchObject,
    locale,
    t,
    handleFieldChange,
    setLaunchForm,
    launchForm,
    busyAction,
  } = useWorkspace();
  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => setManagerScreen("objects")}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>{managerUi.titles.objectLaunch}</h2>
          <p>{managerUi.subtitles.objectLaunch}</p>
        </div>
      </div>

      <form className="launch-wizard" onSubmit={handleLaunchObject}>
        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Объект" : "Property"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.name}</span>
              <Input
                name="propertyName"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.propertyName}
              />
            </label>
            <label>
              <span>{t.fields.address}</span>
              <Input
                name="address"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.address}
              />
            </label>
            <label>
              <span>{t.fields.totalArea}</span>
              <Input
                name="totalArea"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="number"
                value={launchForm.totalArea}
              />
            </label>
            <label>
              <span>{t.fields.rentableArea}</span>
              <Input
                name="rentableArea"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="number"
                value={launchForm.rentableArea}
              />
            </label>
            <label>
              <span>{t.fields.warehouseClass}</span>
              <Select
                name="warehouseClass"
                onChange={handleFieldChange(setLaunchForm)}
                value={launchForm.warehouseClass}
              >
                {t.warehouseClasses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Первое помещение" : "First unit"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.unit}</span>
              <Input
                name="unitNumber"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.unitNumber}
              />
            </label>
            <label>
              <span>{t.fields.floor}</span>
              <Input
                name="floor"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="number"
                value={launchForm.floor}
              />
            </label>
            <label>
              <span>{t.fields.area}</span>
              <Input
                name="unitArea"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="number"
                value={launchForm.unitArea}
              />
            </label>
            <label>
              <span>{t.fields.type}</span>
              <Select
                name="unitType"
                onChange={handleFieldChange(setLaunchForm)}
                value={launchForm.unitType}
              >
                {unitTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {t.unitTypes[option]}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>{t.fields.temperatureRegime}</span>
              <Input
                name="temperatureRegime"
                onChange={handleFieldChange(setLaunchForm)}
                value={launchForm.temperatureRegime}
              />
            </label>
            <label>
              <span>{t.fields.ceilingHeight}</span>
              <Input
                name="ceilingHeight"
                onChange={handleFieldChange(setLaunchForm)}
                type="number"
                value={launchForm.ceilingHeight}
              />
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Арендатор" : "Tenant"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.name}</span>
              <Input
                name="tenantName"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.tenantName}
              />
            </label>
            <label>
              <span>{t.fields.inn}</span>
              <Input
                name="inn"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.inn}
              />
            </label>
            <label>
              <span>{t.fields.contactName}</span>
              <Input
                name="contactName"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.contactName}
              />
            </label>
            <label>
              <span>{t.fields.phone}</span>
              <Input
                name="phone"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.phone}
              />
            </label>
            <label>
              <span>{t.fields.email}</span>
              <Input
                name="email"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.email}
              />
            </label>
            <label>
              <span>{t.fields.riskLevel}</span>
              <Select
                name="riskLevel"
                onChange={handleFieldChange(setLaunchForm)}
                value={launchForm.riskLevel}
              >
                <option value="low">{t.riskLevels.low}</option>
                <option value="medium">{t.riskLevels.medium}</option>
                <option value="high">{t.riskLevels.high}</option>
              </Select>
            </label>
          </div>
        </article>

        <article className="mvp-card">
          <div className="mvp-card-head">
            <div>
              <h3>{locale === "ru" ? "Договор и запуск" : "Lease launch"}</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{t.fields.contractNumber}</span>
              <Input
                name="contractNumber"
                onChange={handleFieldChange(setLaunchForm)}
                required
                value={launchForm.contractNumber}
              />
            </label>
            <label>
              <span>{t.fields.startDate}</span>
              <Input
                name="startDate"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="date"
                value={launchForm.startDate}
              />
            </label>
            <label>
              <span>{t.fields.endDate}</span>
              <Input
                name="endDate"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="date"
                value={launchForm.endDate}
              />
            </label>
            <label>
              <span>{t.fields.ratePerSqm}</span>
              <Input
                name="ratePerSqm"
                onChange={handleFieldChange(setLaunchForm)}
                required
                type="number"
                value={launchForm.ratePerSqm}
              />
            </label>
            <label>
              <span>{t.fields.deposit}</span>
              <Input
                name="deposit"
                onChange={handleFieldChange(setLaunchForm)}
                type="number"
                value={launchForm.deposit}
              />
            </label>
          </div>
          <Button
            variant="primary"
            className="primary-button"
            disabled={busyAction === "object-launch"}
            type="submit"
          >
            {locale === "ru" ? "Создать и запустить" : "Create and launch"}
          </Button>
        </article>
      </form>
    </section>
  );
}
