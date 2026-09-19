import crypto from "node:crypto";
export function createImportsService({
  normalizeImportHeader,
  excelFile,
  tableRows,
  excelRow,
  rowsToObjects,
  parseImportRows,
  db,
  normalizeProperty,
  normalizeTenant,
  normalizeUnit,
  normalizeLease,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeImportBatch,
}) {
  const findByIdOrName = (items, value, selectors) => {
    const needle = normalizeImportHeader(value);
    return (
      items.find((item) =>
        selectors.some(
          (selector) => normalizeImportHeader(selector(item)) === needle,
        ),
      ) ?? null
    );
  };

  const buildImportReportWorkbook = async ({
    templateId,
    rows,
    dryRun = false,
  }) =>
    excelFile(`import-report-${templateId}.xls`, [
      {
        name: "Отчет",
        rows: tableRows(
          [
            { key: "row", label: "Строка" },
            { key: "status", label: "Статус" },
            { key: "action", label: "Action" },
            { key: "changes", label: "Changes" },
            { key: "message", label: "Сообщение" },
            { key: "entityId", label: "ID записи" },
          ],
          rows,
        ),
      },
      {
        name: "Сводная",
        rows: [
          excelRow(["Отчет импорта"], "Title"),
          excelRow(["Раздел", templateId]),
          excelRow(["Mode", dryRun ? "preview" : "commit"]),
          excelRow([
            "Ready",
            rows.filter((row) => row.status === "ready").length,
          ]),
          excelRow([
            "Updated",
            rows.filter((row) => row.status === "updated").length,
          ]),
          excelRow([
            "Успешно",
            rows.filter((row) => row.status === "created").length,
          ]),
          excelRow([
            "Ошибок",
            rows.filter((row) => row.status === "error").length,
          ]),
        ].join(""),
      },
    ]);

  const requireImportFields = (values, fields) => {
    const missing = fields.find((field) => !String(values[field] ?? "").trim());
    if (missing) {
      throw new Error(`Missing field: ${missing}`);
    }
  };

  const compactImportPayload = (payload) =>
    Object.fromEntries(
      Object.entries(payload).filter(
        ([, value]) =>
          value !== undefined && value !== null && String(value).trim() !== "",
      ),
    );

  const uniqueImportMatch = (items, predicates, label) => {
    const matches = items.filter((item) =>
      predicates.some((predicate) => predicate(item)),
    );
    const uniqueById = [
      ...new Map(matches.map((item) => [item.id, item])).values(),
    ];
    if (uniqueById.length > 1) {
      throw new Error(`${label} keys match multiple records`);
    }
    return uniqueById[0] ?? null;
  };

  const getImportAction = ({ mode, existing }) => {
    if (mode === "create") {
      if (existing) {
        throw new Error("Record already exists");
      }
      return "create";
    }
    if (mode === "update") {
      if (!existing) {
        throw new Error("Record not found for update");
      }
      return "update";
    }
    return existing ? "update" : "create";
  };

  const formatImportValue = (value) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return "empty";
    }
    return String(value).trim();
  };

  const importValuesEqual = (left, right) => {
    const leftText = String(left ?? "").trim();
    const rightText = String(right ?? "").trim();
    if (leftText === "" && rightText === "") {
      return true;
    }
    const leftNumber = Number(leftText);
    const rightNumber = Number(rightText);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber === rightNumber;
    }
    return leftText === rightText;
  };

  const buildImportChanges = (existing, payload) => {
    if (!existing) {
      const fields = Object.entries(payload)
        .filter(([key]) => key !== "indexationPct")
        .map(([key, value]) => `${key}: ${formatImportValue(value)}`);
      return fields.length > 0
        ? `New record; ${fields.join("; ")}`
        : "New record";
    }
    const changes = Object.entries(payload)
      .filter(([key]) => key !== "indexationPct")
      .filter(([key, value]) => !importValuesEqual(existing[key], value))
      .map(
        ([key, value]) =>
          `${key}: ${formatImportValue(existing[key])} -> ${formatImportValue(value)}`,
      );

    return changes.length > 0 ? changes.join("; ") : "No changes";
  };

  const runImport = async ({
    templateId,
    filename,
    buffer,
    dryRun = false,
    mode = "create",
    user = null,
  }) => {
    const importMode = ["create", "update", "upsert"].includes(mode)
      ? mode
      : "create";
    const aliasesByTemplate = {
      tenants: {
        название: "name",
        name: "name",
        инн: "inn",
        inn: "inn",
        "контактное лицо": "contactName",
        контакт: "contactName",
        contact: "contactName",
        contactname: "contactName",
        "contact name": "contactName",
        телефон: "phone",
        phone: "phone",
        email: "email",
        риск: "riskLevel",
        risk: "riskLevel",
        risklevel: "riskLevel",
        "risk level": "riskLevel",
      },
      units: {
        объект: "property",
        property: "property",
        номер: "number",
        number: "number",
        этаж: "floor",
        floor: "floor",
        площадь: "area",
        area: "area",
        тип: "type",
        type: "type",
        статус: "status",
        status: "status",
        "температурный режим": "temperatureRegime",
        temperatureregime: "temperatureRegime",
        "temperature regime": "temperatureRegime",
        "высота потолка": "ceilingHeight",
        ceilingheight: "ceilingHeight",
        "ceiling height": "ceilingHeight",
      },
      leases: {
        "номер договора": "contractNumber",
        contractnumber: "contractNumber",
        "contract number": "contractNumber",
        арендатор: "tenant",
        tenant: "tenant",
        помещение: "unit",
        unit: "unit",
        начало: "startDate",
        startdate: "startDate",
        "start date": "startDate",
        окончание: "endDate",
        enddate: "endDate",
        "end date": "endDate",
        "ставка за м2": "ratePerSqm",
        "ставка за м²": "ratePerSqm",
        ratepersqm: "ratePerSqm",
        "rate per sqm": "ratePerSqm",
        депозит: "deposit",
        deposit: "deposit",
        стадия: "stage",
        stage: "stage",
      },
    };
    aliasesByTemplate.payments = {
      "invoice id": "invoiceId",
      invoice: "invoiceId",
      "contract number": "contractNumber",
      contract: "contractNumber",
      period: "period",
      "period yyyy-mm": "period",
      tenant: "tenant",
      amount: "amount",
      "paid at": "paidAt",
      "paid at yyyy-mm-dd": "paidAt",
      method: "method",
      reference: "reference",
    };

    const aliases = aliasesByTemplate[templateId];
    if (!aliases) {
      return null;
    }

    const parsedRows = rowsToObjects(
      await parseImportRows({ filename, buffer }),
      aliases,
    );
    const reportRows = [];
    const rollbackOperations = [];
    const properties = db.listProperties().map(normalizeProperty);
    const tenants = db.listTenants().map(normalizeTenant);
    const units = db.listUnits().map(normalizeUnit);
    const leases = db.listLeases().map(normalizeLease);
    const invoices = db.listBillingInvoices().map(normalizeBillingInvoice);
    const payments = db.listBillingPayments().map(normalizeBillingPayment);

    for (const row of parsedRows) {
      try {
        let createdRecord = null;
        let action = "create";
        let changes = "";
        let entityId = "";
        let entityType = "";
        let rollbackBefore = null;
        if (templateId === "tenants") {
          entityType = "tenant";
          const existing = uniqueImportMatch(
            tenants,
            [
              (tenant) =>
                row.values.inn &&
                normalizeImportHeader(tenant.inn) ===
                  normalizeImportHeader(row.values.inn),
              (tenant) =>
                row.values.phone &&
                normalizeImportHeader(tenant.phone) ===
                  normalizeImportHeader(row.values.phone),
              (tenant) =>
                row.values.email &&
                normalizeImportHeader(tenant.email) ===
                  normalizeImportHeader(row.values.email),
            ],
            "Tenant",
          );
          action = getImportAction({ mode: importMode, existing });
          if (action === "create") {
            requireImportFields(row.values, [
              "name",
              "inn",
              "contactName",
              "phone",
              "email",
            ]);
          }
          const payload = compactImportPayload({
            name: row.values.name,
            inn: row.values.inn,
            contactName: row.values.contactName,
            phone: row.values.phone,
            email: row.values.email,
            riskLevel:
              row.values.riskLevel ||
              (action === "create" ? "medium" : undefined),
          });
          changes = buildImportChanges(
            action === "update" ? existing : null,
            payload,
          );
          entityId = existing?.id ?? "";
          rollbackBefore = action === "update" ? existing : null;
          if (!dryRun) {
            createdRecord =
              action === "update"
                ? db.updateTenant(existing.id, payload)
                : db.createTenant(payload);
          }
        } else if (templateId === "units") {
          entityType = "unit";
          requireImportFields(row.values, ["property", "number"]);
          const property = findByIdOrName(properties, row.values.property, [
            (item) => item.id,
            (item) => item.name,
            (item) => item.address,
          ]);
          if (!property) {
            throw new Error("Объект не найден");
          }
          const existing = units.find(
            (unit) =>
              unit.propertyId === property.id &&
              normalizeImportHeader(unit.number) ===
                normalizeImportHeader(row.values.number),
          );
          action = getImportAction({ mode: importMode, existing });
          if (action === "create") {
            requireImportFields(row.values, ["area"]);
          }
          const payload = compactImportPayload({
            propertyId: property.id,
            number: row.values.number,
            floor: row.values.floor || (action === "create" ? "1" : undefined),
            area: row.values.area,
            type: row.values.type || (action === "create" ? "warm" : undefined),
            status:
              row.values.status || (action === "create" ? "vacant" : undefined),
            temperatureRegime: row.values.temperatureRegime,
            ceilingHeight: row.values.ceilingHeight,
          });
          changes = buildImportChanges(
            action === "update" ? existing : null,
            payload,
          );
          entityId = existing?.id ?? "";
          rollbackBefore = action === "update" ? existing : null;
          if (!dryRun) {
            createdRecord =
              action === "update"
                ? db.updateUnit(existing.id, payload)
                : db.createUnit({
                    ...payload,
                    hasRamp: true,
                    hasGate: true,
                  });
          }
        } else if (templateId === "leases") {
          entityType = "lease";
          requireImportFields(row.values, ["contractNumber"]);
          const existing = leases.find(
            (lease) =>
              normalizeImportHeader(lease.contractNumber) ===
              normalizeImportHeader(row.values.contractNumber),
          );
          action = getImportAction({ mode: importMode, existing });
          if (action === "create") {
            requireImportFields(row.values, [
              "tenant",
              "unit",
              "startDate",
              "endDate",
              "ratePerSqm",
            ]);
          }
          const tenant = row.values.tenant
            ? findByIdOrName(tenants, row.values.tenant, [
                (item) => item.id,
                (item) => item.name,
                (item) => item.inn,
              ])
            : null;
          const unit = row.values.unit
            ? findByIdOrName(units, row.values.unit, [
                (item) => item.id,
                (item) => item.number,
                (item) => `${item.propertyName} ${item.number}`,
              ])
            : null;
          if (row.values.tenant && !tenant) {
            throw new Error("Арендатор не найден");
          }
          if (row.values.unit && !unit) {
            throw new Error("Помещение не найдено");
          }
          const nextUnitId = unit?.id ?? existing?.unitId;
          if (
            nextUnitId &&
            leases.some(
              (lease) =>
                lease.id !== existing?.id && lease.unitId === nextUnitId,
            )
          ) {
            throw new Error("Unit already has a lease");
          }
          const payload = compactImportPayload({
            tenantId: tenant?.id,
            unitId: unit?.id,
            contractNumber: row.values.contractNumber,
            stage:
              row.values.stage || (action === "create" ? "draft" : undefined),
            startDate: row.values.startDate,
            endDate: row.values.endDate,
            ratePerSqm: row.values.ratePerSqm,
            deposit:
              row.values.deposit || (action === "create" ? 0 : undefined),
            indexationPct: action === "create" ? 0 : undefined,
          });
          changes = buildImportChanges(
            action === "update" ? existing : null,
            payload,
          );
          entityId = existing?.id ?? "";
          rollbackBefore = action === "update" ? existing : null;
          if (!dryRun) {
            createdRecord =
              action === "update"
                ? db.updateLease(existing.id, payload)
                : db.createLease(payload);
          }
        } else if (templateId === "payments") {
          entityType = "payment";
          requireImportFields(row.values, ["amount"]);
          const invoice =
            findByIdOrName(invoices, row.values.invoiceId, [
              (item) => item.id,
            ]) ??
            invoices.find((item) => {
              const lease =
                leases.find((candidate) => candidate.id === item.leaseId) ??
                null;
              const matchesContract =
                row.values.contractNumber &&
                normalizeImportHeader(
                  lease?.contractNumber ?? item.contractNumber,
                ) === normalizeImportHeader(row.values.contractNumber);
              const matchesTenant =
                row.values.tenant &&
                normalizeImportHeader(item.tenantName ?? "") ===
                  normalizeImportHeader(row.values.tenant);
              const matchesPeriod =
                row.values.period &&
                normalizeImportHeader(item.period) ===
                  normalizeImportHeader(row.values.period);
              return matchesPeriod && (matchesContract || matchesTenant);
            }) ??
            null;

          if (!invoice) {
            throw new Error("Invoice not found");
          }

          const existing = row.values.reference
            ? payments.find(
                (payment) =>
                  payment.invoiceId === invoice.id &&
                  normalizeImportHeader(payment.reference) ===
                    normalizeImportHeader(row.values.reference),
              )
            : null;
          if (importMode === "update" && !row.values.reference) {
            throw new Error("Payment reference is required for update");
          }
          action = getImportAction({ mode: importMode, existing });
          const payload = compactImportPayload({
            invoiceId: invoice.id,
            amount: row.values.amount,
            paidAt: row.values.paidAt,
            method:
              row.values.method ||
              (action === "create" ? "bank_transfer" : undefined),
            reference: row.values.reference,
          });
          changes = buildImportChanges(
            action === "update" ? existing : null,
            payload,
          );
          entityId = existing?.id ?? "";
          rollbackBefore = action === "update" ? existing : null;
          if (!dryRun) {
            createdRecord =
              action === "update"
                ? db.updateBillingPayment(existing.id, payload)
                : db.createBillingPayment(payload);
          }
        }

        if (!dryRun && createdRecord) {
          rollbackOperations.push({
            row: row.rowNumber,
            entity_type: entityType,
            entity_id: createdRecord.id,
            action,
            before: rollbackBefore,
          });
        }

        reportRows.push({
          row: row.rowNumber,
          status: dryRun
            ? "ready"
            : action === "update"
              ? "updated"
              : "created",
          action,
          changes,
          message: dryRun
            ? `Ready to ${action}`
            : action === "update"
              ? "Updated"
              : "Создано",
          entityId: createdRecord?.id ?? entityId,
        });
      } catch (error) {
        reportRows.push({
          row: row.rowNumber,
          status: "error",
          action: "",
          changes: "",
          message: error instanceof Error ? error.message : "Import failed",
          entityId: "",
        });
      }
    }

    const reportFile = await buildImportReportWorkbook({
      templateId,
      rows: reportRows,
      dryRun,
    });
    const reportContent = Buffer.isBuffer(reportFile.content)
      ? reportFile.content
      : Buffer.from(reportFile.content, "utf8");
    const summary = {
      total: reportRows.length,
      ready: reportRows.filter((row) => row.status === "ready").length,
      created: reportRows.filter((row) => row.status === "created").length,
      updated: reportRows.filter((row) => row.status === "updated").length,
      errors: reportRows.filter((row) => row.status === "error").length,
    };
    const batch =
      !dryRun && rollbackOperations.length > 0
        ? normalizeImportBatch(
            db.createImportBatch({
              templateId,
              fileName: filename,
              mode: importMode,
              summary,
              rows: reportRows,
              operations: rollbackOperations,
              createdBy: user?.id ?? null,
              createdByName: user?.fullName ?? user?.full_name ?? null,
            }),
          )
        : null;

    return {
      summary,
      rows: reportRows,
      batch,
      report: {
        filename: reportFile.filename,
        contentBase64: reportContent.toString("base64"),
      },
    };
  };

  const buildImportBatchAuditFile = async (batch) => {
    const rows = Array.isArray(batch.rows) ? batch.rows : [];
    const operations = Array.isArray(batch.operations) ? batch.operations : [];
    const payloadHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          id: batch.id,
          templateId: batch.template_id,
          fileName: batch.file_name,
          mode: batch.mode,
          summary: batch.summary,
          rows,
          operations,
          createdAt: batch.created_at,
          createdBy: batch.created_by,
        }),
      )
      .digest("hex");

    return excelFile(`import-audit-${batch.id}.xlsx`, [
      {
        name: "Summary",
        rows: [
          excelRow(["sklad kontur import audit"], "Title"),
          excelRow(["Field", "Value"], "Header"),
          excelRow(["Batch ID", batch.id]),
          excelRow(["Template", batch.template_id]),
          excelRow(["File", batch.file_name]),
          excelRow(["Mode", batch.mode]),
          excelRow(["Status", batch.status]),
          excelRow([
            "Created by",
            batch.created_by_name ?? batch.created_by ?? "",
          ]),
          excelRow(["Created at", batch.created_at]),
          excelRow(["Rolled back at", batch.rolled_back_at ?? ""]),
          excelRow(["Operations", operations.length]),
          excelRow(["Rows", rows.length]),
          excelRow(["SHA-256", payloadHash]),
        ].join(""),
      },
      {
        name: "Rows",
        rows: tableRows(
          [
            { key: "row", label: "Row" },
            { key: "status", label: "Status" },
            { key: "action", label: "Action" },
            { key: "changes", label: "Changes" },
            { key: "message", label: "Message" },
            { key: "entityId", label: "Entity ID" },
          ],
          rows,
        ),
      },
      {
        name: "Rollback log",
        rows: tableRows(
          [
            { key: "row", label: "Row" },
            { key: "entity_type", label: "Entity type" },
            { key: "entity_id", label: "Entity ID" },
            { key: "action", label: "Action" },
            { key: "before", label: "Before snapshot" },
          ],
          operations.map((operation) => ({
            ...operation,
            before: operation.before ? JSON.stringify(operation.before) : "",
          })),
        ),
      },
    ]);
  };
  return {
    findByIdOrName,
    buildImportReportWorkbook,
    requireImportFields,
    compactImportPayload,
    uniqueImportMatch,
    getImportAction,
    formatImportValue,
    importValuesEqual,
    buildImportChanges,
    runImport,
    buildImportBatchAuditFile,
  };
}
