import { useWorkspace } from "../../app/WorkspaceContext";
import { ResponsiveTable } from "../../ResponsiveTable";
import {
  daysUntil,
  formatArea,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatMoney,
  paymentMethodLabel,
  supportedFileHint,
} from "../../shared/format";
import { type TenantDetailTab, type TenantMeter } from "../../shared/types";
import { Button, Input, Select, Textarea } from "../../ui";
export function ManagerTenantDetail() {
  const {
    managerUi,
    t,
    ui,
    locale,
    setManagerScreen,
    tenantDetail,
    selectedTenant,
    openManagerTenantEdit,
    adminEditLabel,
    canDeletePortfolioItems,
    handleDelete,
    tenantDetailBusy,
    tenantDetailTab,
    setTenantDetailTab,
    loadLeaseDocuments,
    openManagerLeaseEdit,
    handleMeterReadingSubmit,
    handleFieldChange,
    setMeterReadingForm,
    meterReadingForm,
    busyAction,
    canManagePortfolio,
    handleTenantNoteSubmit,
    setTenantNoteForm,
    tenantNoteForm,
    tenantNoteFile,
    setTenantNoteFile,
    getFileKind,
    expandedTenantNoteIds,
    toggleTenantNoteExpanded,
    openTenantNoteAttachment,
    deleteTenantNoteAttachment,
    uploadTenantNoteAttachment,
    openTicketDetail,
  } = useWorkspace();

  const tenantTabs: { id: TenantDetailTab; label: string }[] = [
    { id: "info", label: managerUi.baseInfo },
    { id: "contracts", label: t.nav.leases },
    { id: "payments", label: ui.payments },
    {
      id: "meters",
      label:
        locale === "ru"
          ? "\u0421\u0447\u0435\u0442\u0447\u0438\u043a\u0438"
          : "Meters",
    },
    { id: "notes", label: ui.notes },
    { id: "tickets", label: managerUi.nav.tickets },
    { id: "risks", label: ui.risks },
  ];
  const meterTypeLabels: Record<TenantMeter["meterType"], string> = {
    power: locale === "ru" ? "Энергопотребление" : "Power",
    electricity: locale === "ru" ? "Электроэнергия" : "Electricity",
    cold_chain: locale === "ru" ? "Холодильный контур" : "Cold chain",
    heating: locale === "ru" ? "Отопление" : "Heating",
    water: locale === "ru" ? "Вода" : "Water",
  };

  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => setManagerScreen("tenants")}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>
            {tenantDetail?.tenant.name ??
              selectedTenant?.name ??
              managerUi.titles.tenantDetail}
          </h2>
        </div>
        {tenantDetail ? (
          <div className="mvp-actions">
            <Button
              variant="secondary"
              className="secondary-button"
              onClick={() => openManagerTenantEdit(tenantDetail.tenant)}
              type="button"
            >
              {adminEditLabel}
            </Button>
            {canDeletePortfolioItems ? (
              <Button
                variant="text"
                className="text-button text-button--danger"
                onClick={() =>
                  void handleDelete(`/api/tenants/${tenantDetail.tenant.id}`)
                }
                type="button"
              >
                {t.actions.delete}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tenantDetailBusy ? (
        <div className="mvp-card">
          <div className="empty-state">{t.loading}</div>
        </div>
      ) : tenantDetail ? (
        <>
          <div className="mvp-tabs">
            {tenantTabs.map((tab) => (
              <Button
                variant="plain"
                className={
                  tenantDetailTab === tab.id
                    ? "mvp-tab mvp-tab--active"
                    : "mvp-tab"
                }
                key={tab.id}
                onClick={() => setTenantDetailTab(tab.id)}
                type="button"
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {tenantDetailTab === "info" ? (
            <div className="mvp-grid">
              <article className="mvp-card">
                <div className="mvp-card-head">
                  <div>
                    <h3>{tenantDetail.tenant.name}</h3>
                  </div>
                </div>
                <div className="mvp-info-list">
                  <div className="mvp-info-row">
                    <span>{t.fields.inn}</span>
                    <strong>{tenantDetail.tenant.inn}</strong>
                  </div>
                  <div className="mvp-info-row">
                    <span>{t.fields.contactName}</span>
                    <strong>{tenantDetail.tenant.contactName}</strong>
                  </div>
                  <div className="mvp-info-row">
                    <span>{t.fields.phone}</span>
                    <strong>{tenantDetail.tenant.phone}</strong>
                  </div>
                  <div className="mvp-info-row">
                    <span>{t.fields.email}</span>
                    <strong>{tenantDetail.tenant.email}</strong>
                  </div>
                  <div className="mvp-info-row">
                    <span>{t.fields.riskLevel}</span>
                    <strong>
                      {
                        t.riskLevels[
                          tenantDetail.tenant
                            .riskLevel as keyof typeof t.riskLevels
                        ]
                      }
                    </strong>
                  </div>
                </div>
              </article>

              <article className="mvp-card">
                <div className="mvp-card-head">
                  <div>
                    <h3>{ui.tenantPassport}</h3>
                  </div>
                </div>
                <div className="mvp-metrics mvp-metrics--compact">
                  <article
                    className="mvp-metric"
                    title="Сумма площадей связанных помещений без повторного учёта одного помещения."
                  >
                    <span>{t.fields.area} ⓘ</span>
                    <strong>
                      {formatArea(tenantDetail.summary.totalArea, locale)}
                    </strong>
                  </article>
                  <article
                    className="mvp-metric"
                    title="Площадь × месячная ставка по действующим договорам."
                  >
                    <span>{ui.monthlyRent} ⓘ</span>
                    <strong>
                      {formatCompactMoney(
                        tenantDetail.summary.monthlyRent,
                        locale,
                      )}
                    </strong>
                  </article>
                  <article
                    className="mvp-metric"
                    title="Фактически оплачено / начислено по счетам арендатора × 100%. Частичные оплаты учитываются."
                  >
                    <span>{ui.paymentDiscipline} ⓘ</span>
                    <strong>{tenantDetail.summary.paymentDiscipline}%</strong>
                  </article>
                  <article
                    className="mvp-metric"
                    title="Неоплаченный остаток счетов с истёкшим сроком оплаты."
                  >
                    <span>{ui.arrears} ⓘ</span>
                    <strong>
                      {formatCompactMoney(
                        tenantDetail.summary.arrearsAmount,
                        locale,
                      )}
                    </strong>
                  </article>
                </div>
              </article>
            </div>
          ) : null}

          {tenantDetailTab === "contracts" ? (
            <article className="mvp-card">
              <div className="mvp-table-wrap">
                <ResponsiveTable className="mvp-table">
                  <thead>
                    <tr>
                      <th>{t.fields.contractNumber}</th>
                      <th>{t.fields.unit}</th>
                      <th>{t.fields.stage}</th>
                      <th>{t.fields.ratePerSqm}</th>
                      <th>{t.fields.endDate}</th>
                      <th>{t.fields.document}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantDetail.leases.map((lease) => (
                      <tr
                        key={lease.id}
                        className={
                          lease.stage !== "terminated" &&
                          (daysUntil(lease.endDate) ?? 1) < 0
                            ? "lease-expired"
                            : ""
                        }
                      >
                        <td>{lease.contractNumber}</td>
                        <td>{lease.unitNumber ?? "—"}</td>
                        <td>
                          {
                            t.leaseStages[
                              lease.stage as keyof typeof t.leaseStages
                            ]
                          }
                        </td>
                        <td>{formatMoney(lease.ratePerSqm, locale)}</td>
                        <td>
                          {formatDate(lease.endDate, locale)}
                          {lease.stage !== "terminated" &&
                          (daysUntil(lease.endDate) ?? 1) < 0 ? (
                            <small>Срок истёк</small>
                          ) : null}
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            className="secondary-button secondary-button--compact"
                            onClick={() => void loadLeaseDocuments(lease)}
                            type="button"
                          >
                            {managerUi.open}
                          </Button>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            className="secondary-button secondary-button--compact"
                            onClick={() => openManagerLeaseEdit(lease)}
                            type="button"
                          >
                            {adminEditLabel}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </article>
          ) : null}

          {tenantDetailTab === "payments" ? (
            <article className="mvp-card">
              <div className="mvp-table-wrap">
                <ResponsiveTable className="mvp-table">
                  <thead>
                    <tr>
                      <th>{ui.payments}</th>
                      <th>{t.fields.status}</th>
                      <th>{t.fields.endDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantDetail.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <strong>{payment.period}</strong>
                          <small>
                            {formatMoney(payment.amount, locale)} ·{" "}
                            {paymentMethodLabel(payment.method)}
                          </small>
                        </td>
                        <td>{ui.paymentStatus[payment.status]}</td>
                        <td>
                          {formatDate(
                            payment.paidDate ?? payment.dueDate,
                            locale,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </article>
          ) : null}

          {tenantDetailTab === "meters" ? (
            <article className="mvp-card">
              <form className="mvp-form" onSubmit={handleMeterReadingSubmit}>
                <label>
                  <span>{t.fields.unit}</span>
                  <Select
                    name="unitId"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    required
                    value={meterReadingForm.unitId}
                  >
                    {tenantDetail.units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.number} · {formatArea(unit.area, locale)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <span>{locale === "ru" ? "Период" : "Period"}</span>
                  <Input
                    name="period"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    required
                    type="month"
                    value={meterReadingForm.period}
                  />
                </label>
                <label>
                  <span>{locale === "ru" ? "Счетчик" : "Meter"}</span>
                  <Select
                    name="meterType"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    value={meterReadingForm.meterType}
                  >
                    {Object.entries(meterTypeLabels).map(
                      ([meterType, label]) => (
                        <option key={meterType} value={meterType}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </label>
                <label>
                  <span>{locale === "ru" ? "Предыдущее" : "Previous"}</span>
                  <Input
                    name="previousValue"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    type="number"
                    value={meterReadingForm.previousValue}
                  />
                </label>
                <label>
                  <span>{locale === "ru" ? "Текущее" : "Current"}</span>
                  <Input
                    name="value"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    required
                    type="number"
                    value={meterReadingForm.value}
                  />
                </label>
                <label>
                  <span>{locale === "ru" ? "Тариф" : "Tariff"}</span>
                  <Input
                    name="tariffRate"
                    onChange={handleFieldChange(setMeterReadingForm)}
                    type="number"
                    value={meterReadingForm.tariffRate}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "meter-reading"}
                  type="submit"
                >
                  {locale === "ru" ? "Сохранить показание" : "Save reading"}
                </Button>
              </form>
              <div className="mvp-table-wrap">
                <ResponsiveTable className="mvp-table">
                  <thead>
                    <tr>
                      <th>
                        {locale === "ru"
                          ? "\u0421\u0447\u0435\u0442\u0447\u0438\u043a"
                          : "Meter"}
                      </th>
                      <th>{t.fields.unit}</th>
                      <th>{locale === "ru" ? "Период" : "Period"}</th>
                      <th>
                        {locale === "ru"
                          ? "\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u0438\u0435"
                          : "Reading"}
                      </th>
                      <th>{locale === "ru" ? "Расход" : "Consumption"}</th>
                      <th>{locale === "ru" ? "Сумма" : "Charge"}</th>
                      <th>
                        {locale === "ru"
                          ? "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430"
                          : "Delta"}
                      </th>
                      <th>{t.fields.status}</th>
                      <th>{t.fields.endDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantDetail.meters.map((meter) => (
                      <tr key={meter.id}>
                        <td>
                          {meterTypeLabels[meter.meterType] ?? meter.name}
                        </td>
                        <td>{meter.unitNumber}</td>
                        <td>{meter.period}</td>
                        <td>{meter.lastValue}</td>
                        <td>{meter.consumption}</td>
                        <td>{formatMoney(meter.chargeAmount, locale)}</td>
                        <td>{meter.deltaPct}%</td>
                        <td>
                          {meter.status === "attention"
                            ? ui.riskSeverity.warning
                            : ui.paymentStatus.paid}
                        </td>
                        <td>{formatDateTime(meter.updatedAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
              {tenantDetail.meters.length === 0 ? (
                <div className="empty-state">{t.hints.noData}</div>
              ) : null}
            </article>
          ) : null}

          {tenantDetailTab === "notes" ? (
            <div className="mvp-stack">
              {canManagePortfolio ? (
                <form
                  className="mvp-card mvp-form"
                  onSubmit={handleTenantNoteSubmit}
                >
                  <div className="mvp-card-head">
                    <div>
                      <h3>
                        {locale === "ru"
                          ? "Добавить запись переговоров"
                          : "Add negotiation note"}
                      </h3>
                    </div>
                  </div>
                  <label>
                    <span>{locale === "ru" ? "Тема" : "Subject"}</span>
                    <Input
                      name="title"
                      onChange={handleFieldChange(setTenantNoteForm)}
                      placeholder={
                        locale === "ru"
                          ? "Например: условия пролонгации"
                          : "For example: renewal terms"
                      }
                      value={tenantNoteForm.title}
                    />
                  </label>
                  <label>
                    <span>
                      {locale === "ru" ? "Что обсудили" : "Discussion summary"}
                    </span>
                    <Textarea
                      name="content"
                      onChange={handleFieldChange(setTenantNoteForm)}
                      placeholder={
                        locale === "ru"
                          ? "Фиксируйте договоренности, риски, следующий шаг и ответственного."
                          : "Capture agreements, risks, next step, and owner."
                      }
                      rows={4}
                      value={tenantNoteForm.content}
                    />
                  </label>
                  <label
                    className={
                      tenantNoteFile
                        ? "document-upload document-upload--ready"
                        : "document-upload"
                    }
                  >
                    <span>
                      {locale === "ru"
                        ? "Файл к переговорам"
                        : "Negotiation file"}
                    </span>
                    <span className="file-picker-control">
                      <span className="file-picker-button">
                        {tenantNoteFile
                          ? locale === "ru"
                            ? "Заменить файл"
                            : "Replace file"
                          : locale === "ru"
                            ? "Прикрепить файл"
                            : "Attach file"}
                      </span>
                      <span className="file-picker-name">
                        {tenantNoteFile
                          ? tenantNoteFile.name
                          : locale === "ru"
                            ? "Файл не выбран"
                            : "No file selected"}
                      </span>
                    </span>
                    <Input
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                      onChange={(event) => {
                        setTenantNoteFile(
                          event.currentTarget.files?.[0] ?? null,
                        );
                        event.currentTarget.value = "";
                      }}
                      type="file"
                    />
                    <small className="attachment-hint">
                      {supportedFileHint(locale)} · до 100 МБ на файл
                    </small>
                  </label>
                  {tenantNoteFile ? (
                    <div className="file-picked-summary">
                      <span>{getFileKind(tenantNoteFile.name)}</span>
                      <strong>{tenantNoteFile.name}</strong>
                      <Button
                        variant="text"
                        className="text-button"
                        onClick={() => setTenantNoteFile(null)}
                        type="button"
                      >
                        {t.actions.delete}
                      </Button>
                    </div>
                  ) : null}
                  <Button
                    variant="primary"
                    className="primary-button"
                    disabled={
                      busyAction === "tenant-note" ||
                      !tenantNoteForm.title.trim() ||
                      !tenantNoteForm.content.trim()
                    }
                    type="submit"
                  >
                    {busyAction === "tenant-note"
                      ? locale === "ru"
                        ? "Сохраняем..."
                        : "Saving..."
                      : t.actions.save}
                  </Button>
                </form>
              ) : null}
              {tenantDetail.notes.length > 0 ? (
                tenantDetail.notes.map((note) => {
                  const isExpanded = Boolean(expandedTenantNoteIds[note.id]);
                  const isManualNote = !note.id.startsWith("note-");
                  const noteAttachments = note.attachments ?? [];
                  const shortContent =
                    note.content.length > 170
                      ? `${note.content.slice(0, 170).trim()}...`
                      : note.content;

                  return (
                    <article
                      className="mvp-card tenant-note-card"
                      key={note.id}
                    >
                      <div className="tenant-note-top">
                        <div>
                          <strong>{note.title}</strong>
                          <small>
                            {note.authorName} ·{" "}
                            {formatDateTime(note.createdAt, locale)}
                          </small>
                        </div>
                        <Button
                          variant="secondary"
                          className="secondary-button secondary-button--compact"
                          onClick={() => toggleTenantNoteExpanded(note.id)}
                          type="button"
                        >
                          {isExpanded
                            ? locale === "ru"
                              ? "Свернуть"
                              : "Collapse"
                            : locale === "ru"
                              ? "Развернуть"
                              : "Expand"}
                        </Button>
                      </div>
                      <p>{isExpanded ? note.content : shortContent}</p>
                      {!isExpanded && noteAttachments.length > 0 ? (
                        <small className="attachment-hint">
                          {noteAttachments.length}{" "}
                          {locale === "ru" ? "файл." : "files"}
                        </small>
                      ) : null}
                      {isExpanded ? (
                        <div className="tenant-note-expanded">
                          {noteAttachments.length > 0 ? (
                            <div className="attachment-grid">
                              {noteAttachments.map((attachment) => (
                                <article
                                  className="attachment-card"
                                  key={attachment.id}
                                >
                                  <Button
                                    variant="plain"
                                    className="attachment-preview"
                                    onClick={() =>
                                      void openTenantNoteAttachment(
                                        note.id,
                                        attachment,
                                      )
                                    }
                                    type="button"
                                  >
                                    <span>
                                      {getFileKind(attachment.fileName)}
                                    </span>
                                  </Button>
                                  <div>
                                    <strong>{attachment.fileName}</strong>
                                    <small>
                                      {formatFileSize(
                                        attachment.sizeBytes,
                                        locale,
                                      )}{" "}
                                      ·{" "}
                                      {formatDateTime(
                                        attachment.createdAt,
                                        locale,
                                      )}
                                    </small>
                                    <small>
                                      {attachment.uploadedByName ?? "—"}
                                    </small>
                                  </div>
                                  {canManagePortfolio ? (
                                    <Button
                                      variant="text"
                                      className="text-button text-button--danger"
                                      onClick={() =>
                                        void deleteTenantNoteAttachment(
                                          note.id,
                                          attachment.id,
                                        )
                                      }
                                      type="button"
                                    >
                                      {t.actions.delete}
                                    </Button>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state">
                              {locale === "ru"
                                ? "Файлы к записи не прикреплены."
                                : "No files attached to this note."}
                            </div>
                          )}
                          {canManagePortfolio && isManualNote ? (
                            <label className="secondary-button secondary-button--compact attachment-upload tenant-note-upload">
                              {busyAction ===
                              `tenant-note-attachment-${note.id}`
                                ? locale === "ru"
                                  ? "Загружаем..."
                                  : "Uploading..."
                                : locale === "ru"
                                  ? "Прикрепить файл"
                                  : "Attach file"}
                              <Input
                                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                                disabled={
                                  busyAction ===
                                  `tenant-note-attachment-${note.id}`
                                }
                                onChange={(event) => {
                                  const file =
                                    event.currentTarget.files?.[0] ?? null;
                                  event.currentTarget.value = "";
                                  void uploadTenantNoteAttachment(
                                    note.id,
                                    file,
                                  );
                                }}
                                type="file"
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="mvp-card">
                  <div className="empty-state">{t.hints.noData}</div>
                </div>
              )}
            </div>
          ) : null}

          {tenantDetailTab === "tickets" ? (
            <article className="mvp-card">
              <div className="mvp-table-wrap">
                <ResponsiveTable className="mvp-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>{t.fields.category}</th>
                      <th>{t.fields.priority}</th>
                      <th>{t.fields.status}</th>
                      <th>{t.fields.endDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantDetail.tickets.map((ticket) => (
                      <tr
                        key={ticket.id}
                        onClick={() => openTicketDetail(ticket.id)}
                      >
                        <td>{ticket.number}</td>
                        <td>
                          {
                            t.ticketCategories[
                              ticket.category as keyof typeof t.ticketCategories
                            ]
                          }
                        </td>
                        <td>
                          {
                            t.ticketPriorities[
                              ticket.priority as keyof typeof t.ticketPriorities
                            ]
                          }
                        </td>
                        <td>
                          {
                            t.ticketStatuses[
                              ticket.status as keyof typeof t.ticketStatuses
                            ]
                          }
                        </td>
                        <td>{formatDate(ticket.updatedAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </article>
          ) : null}

          {tenantDetailTab === "risks" ? (
            <div className="mvp-stack">
              {tenantDetail.risks.length > 0 ? (
                tenantDetail.risks.map((risk) => (
                  <article className="mvp-card" key={risk.id}>
                    <strong>{risk.title}</strong>
                    <p>{risk.owner}</p>
                    <small>
                      {ui.riskSeverity[risk.severity]} ·{" "}
                      {formatDate(risk.dueDate, locale)}
                    </small>
                  </article>
                ))
              ) : (
                <div className="mvp-card">
                  <div className="empty-state">{t.hints.noData}</div>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mvp-card">
          <div className="empty-state">{ui.emptyTenant}</div>
        </div>
      )}
    </section>
  );
}
