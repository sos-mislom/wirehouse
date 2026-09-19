import { isOpenTicket } from "../../../../packages/contracts/src/domain.js";
export function createExportsService({
  activeLeaseStages,
  sumBy,
  roundMetric,
  excelFile,
  excelRow,
  tableRows,
  buildFinanceSummary,
  db,
  normalizeBillingInvoice,
  normalizeBillingPayment,
  normalizeMeterReading,
  sanitizeFilename,
  buildBillingReconciliation,
}) {
  const buildExportFile = async (exportId, scoped, scopedTickets) => {
    const totals = {
      properties: scoped.properties.length,
      units: scoped.units.length,
      tenants: scoped.tenants.length,
      leases: scoped.leases.length,
      activeLeases: scoped.leases.filter((lease) =>
        activeLeaseStages.has(lease.stage),
      ).length,
      occupiedArea: sumBy(
        scoped.units.filter((unit) => unit.status === "occupied"),
        (unit) => unit.area,
      ),
      vacantArea: sumBy(
        scoped.units.filter((unit) => unit.status === "vacant"),
        (unit) => unit.area,
      ),
      totalRentableArea: sumBy(
        scoped.properties,
        (property) => property.rentableArea,
      ),
      openTickets: scopedTickets.filter(
        (ticket) => !["resolved", "closed"].includes(ticket.status),
      ).length,
    };
    const occupancyRate =
      totals.totalRentableArea > 0
        ? roundMetric((totals.occupiedArea / totals.totalRentableArea) * 100)
        : 0;

    if (exportId === "rent-roll") {
      return excelFile("rent-roll.xls", [
        {
          name: "Сводная",
          rows: [
            excelRow(["Rent roll"], "Title"),
            excelRow(["Показатель", "Значение"], "Header"),
            excelRow(["Объектов", totals.properties]),
            excelRow(["Арендаторов", totals.tenants]),
            excelRow(["Договоров", totals.leases]),
            excelRow(["Активных договоров", totals.activeLeases]),
            excelRow(["Занятая площадь, м2", totals.occupiedArea]),
            excelRow(["Вакантная площадь, м2", totals.vacantArea]),
            excelRow(["Занятость, %", occupancyRate]),
          ].join(""),
        },
        {
          name: "Договоры",
          rows: tableRows(
            [
              { key: "contractNumber", label: "Номер договора" },
              { key: "tenantName", label: "Арендатор" },
              { key: "propertyName", label: "Объект" },
              { key: "unitNumber", label: "Помещение" },
              { key: "stage", label: "Стадия" },
              { key: "startDate", label: "Начало" },
              { key: "endDate", label: "Окончание" },
              { key: "ratePerSqm", label: "Ставка за м2" },
              { key: "deposit", label: "Депозит" },
              { key: "indexationPct", label: "Индексация %" },
            ],
            scoped.leases,
          ),
        },
        {
          name: "Арендаторы",
          rows: tableRows(
            [
              { key: "name", label: "Название" },
              { key: "inn", label: "ИНН" },
              { key: "contactName", label: "Контакт" },
              { key: "phone", label: "Телефон" },
              { key: "email", label: "Email" },
              { key: "riskLevel", label: "Риск" },
              { key: "leaseCount", label: "Договоров" },
            ],
            scoped.tenants,
          ),
        },
        {
          name: "Помещения",
          rows: tableRows(
            [
              { key: "propertyName", label: "Объект" },
              { key: "number", label: "Номер" },
              { key: "floor", label: "Этаж" },
              { key: "area", label: "Площадь" },
              { key: "type", label: "Тип" },
              { key: "status", label: "Статус" },
              { key: "tenantName", label: "Арендатор" },
            ],
            scoped.units,
          ),
        },
      ]);
    }

    if (exportId === "service-digest") {
      const byStatus = [
        ...new Set(scopedTickets.map((ticket) => ticket.status)),
      ].map((status) => ({
        status,
        count: scopedTickets.filter((ticket) => ticket.status === status)
          .length,
      }));
      return excelFile("service-desk-digest.xls", [
        {
          name: "Сводная",
          rows: [
            excelRow(["Service desk digest"], "Title"),
            excelRow(["Показатель", "Значение"], "Header"),
            excelRow(["Всего заявок", scopedTickets.length]),
            excelRow(["Открытых заявок", totals.openTickets]),
            excelRow([
              "Критичных",
              scopedTickets.filter((ticket) => ticket.priority === "urgent")
                .length,
            ]),
            excelRow([
              "Каналов Telegram/VK",
              scopedTickets.filter((ticket) =>
                ["telegram", "vk"].includes(ticket.sourceChannel),
              ).length,
            ]),
          ].join(""),
        },
        {
          name: "Заявки",
          rows: tableRows(
            [
              { key: "number", label: "Номер" },
              { key: "title", label: "Тема" },
              { key: "tenantName", label: "Арендатор" },
              { key: "propertyName", label: "Объект" },
              { key: "unitNumber", label: "Помещение" },
              { key: "category", label: "Категория" },
              { key: "priority", label: "Приоритет" },
              { key: "status", label: "Статус" },
              { key: "sourceChannel", label: "Канал" },
              { key: "assignedToName", label: "Исполнитель" },
              { key: "updatedAt", label: "Обновлено" },
            ],
            scopedTickets,
          ),
        },
        {
          name: "По статусам",
          rows: tableRows(
            [
              { key: "status", label: "Статус" },
              { key: "count", label: "Количество" },
            ],
            byStatus,
          ),
        },
      ]);
    }

    if (exportId === "cashflow") {
      const finance = buildFinanceSummary(scoped, scopedTickets);
      return excelFile("cashflow-forecast.xls", [
        {
          name: "Сводная",
          rows: [
            excelRow(["Cashflow forecast"], "Title"),
            excelRow(["Показатель", "Значение"], "Header"),
            excelRow(["Сбор платежей, %", finance.collectionRate]),
            excelRow(["Просрочка", finance.arrearsAmount]),
            excelRow(["NOI", finance.noi]),
            excelRow(["OPEX, %", finance.opexRatio]),
            excelRow(["Прогноз квартал", finance.forecastQuarter]),
          ].join(""),
        },
        {
          name: "Прогноз",
          rows: tableRows(
            [
              { key: "label", label: "Период" },
              { key: "billed", label: "Начислено" },
              { key: "forecast", label: "Прогноз" },
            ],
            finance.series,
          ),
        },
        {
          name: "Объекты",
          rows: tableRows(
            [
              { key: "name", label: "Объект" },
              { key: "address", label: "Адрес" },
              { key: "rentableArea", label: "Арендуемая площадь" },
              { key: "warehouseClass", label: "Класс" },
            ],
            scoped.properties,
          ),
        },
      ]);
    }

    if (exportId === "billing-ledger") {
      const leaseIds = new Set(scoped.leases.map((lease) => lease.id));
      const invoiceIds = new Set();
      const invoices = db
        .listBillingInvoices()
        .map(normalizeBillingInvoice)
        .filter((invoice) => {
          const allowed = leaseIds.has(invoice.leaseId);
          if (allowed) {
            invoiceIds.add(invoice.id);
          }
          return allowed;
        });
      const payments = db
        .listBillingPayments()
        .filter((payment) => invoiceIds.has(payment.invoice_id))
        .map(normalizeBillingPayment);
      const billed = sumBy(invoices, (invoice) => invoice.totalAmount);
      const paid = sumBy(invoices, (invoice) => invoice.paidAmount);

      return excelFile("billing-ledger.xls", [
        {
          name: "Summary",
          rows: [
            excelRow(["Billing ledger"], "Title"),
            excelRow(["Metric", "Value"], "Header"),
            excelRow(["Invoices", invoices.length]),
            excelRow(["Billed", billed]),
            excelRow(["Paid", paid]),
            excelRow(["Outstanding", Math.max(0, billed - paid)]),
          ].join(""),
        },
        {
          name: "Invoices",
          rows: tableRows(
            [
              { key: "period", label: "Period" },
              { key: "tenantName", label: "Tenant" },
              { key: "contractNumber", label: "Contract" },
              { key: "propertyName", label: "Property" },
              { key: "unitNumber", label: "Unit" },
              { key: "rentAmount", label: "Rent" },
              { key: "variableAmount", label: "Variable" },
              { key: "totalAmount", label: "Total" },
              { key: "paidAmount", label: "Paid" },
              { key: "dueDate", label: "Due" },
              { key: "status", label: "Status" },
            ],
            invoices,
          ),
        },
        {
          name: "Payments",
          rows: tableRows(
            [
              { key: "paidAt", label: "Paid at" },
              { key: "tenantName", label: "Tenant" },
              { key: "contractNumber", label: "Contract" },
              { key: "period", label: "Period" },
              { key: "amount", label: "Amount" },
              { key: "method", label: "Method" },
              { key: "reference", label: "Reference" },
            ],
            payments,
          ),
        },
      ]);
    }

    return null;
  };

  const buildBillingInvoiceExportFile = async (invoice) => {
    const payments = db
      .listBillingPayments({ invoiceId: invoice.id })
      .map(normalizeBillingPayment);
    const readings = db
      .listMeterReadings({
        tenantId: invoice.tenantId,
        unitId: invoice.unitId,
        period: invoice.period,
      })
      .map(normalizeMeterReading);
    const outstanding = Math.max(
      0,
      Number(invoice.totalAmount) - Number(invoice.paidAmount),
    );
    const filename =
      `invoice-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/-+/g, "-");

    return excelFile(filename, [
      {
        name: "Invoice",
        rows: [
          excelRow(["sklad kontur invoice"], "Title"),
          excelRow(["Field", "Value"], "Header"),
          excelRow(["Period", invoice.period]),
          excelRow(["Tenant", invoice.tenantName ?? ""]),
          excelRow(["Contract", invoice.contractNumber ?? ""]),
          excelRow(["Property", invoice.propertyName ?? ""]),
          excelRow(["Unit", invoice.unitNumber ?? ""]),
          excelRow(["Rent amount", invoice.rentAmount]),
          excelRow(["Variable amount", invoice.variableAmount]),
          excelRow(["Total", invoice.totalAmount]),
          excelRow(["Paid", invoice.paidAmount]),
          excelRow(["Outstanding", outstanding]),
          excelRow(["Due date", invoice.dueDate]),
          excelRow(["Status", invoice.status]),
        ].join(""),
      },
      {
        name: "Meter readings",
        rows: tableRows(
          [
            { key: "period", label: "Period" },
            { key: "unitNumber", label: "Unit" },
            { key: "meterType", label: "Meter" },
            { key: "previousValue", label: "Previous" },
            { key: "value", label: "Current" },
            { key: "consumption", label: "Consumption" },
            { key: "tariffRate", label: "Tariff" },
            { key: "chargeAmount", label: "Charge" },
            { key: "recordedAt", label: "Recorded at" },
          ],
          readings,
        ),
      },
      {
        name: "Payments",
        rows: tableRows(
          [
            { key: "paidAt", label: "Paid at" },
            { key: "amount", label: "Amount" },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" },
          ],
          payments,
        ),
      },
    ]);
  };

  const buildBillingClosingPackFile = async (invoice) => {
    const payments = db
      .listBillingPayments({ invoiceId: invoice.id })
      .map(normalizeBillingPayment);
    const readings = db
      .listMeterReadings({
        tenantId: invoice.tenantId,
        unitId: invoice.unitId,
        period: invoice.period,
      })
      .map(normalizeMeterReading);
    const paidAmount = sumBy(payments, (payment) => payment.amount);
    const outstanding = Math.max(0, Number(invoice.totalAmount) - paidAmount);
    const overpaid = Math.max(0, paidAmount - Number(invoice.totalAmount));
    const reconciliationStatus =
      overpaid > 0
        ? "overpaid"
        : outstanding <= 0
          ? "matched"
          : paidAmount > 0
            ? "partial"
            : "unpaid";
    const filename =
      `closing-pack-${invoice.period}-${invoice.contractNumber ?? invoice.id}.xlsx`
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/-+/g, "-");
    const serviceRows = [
      {
        line: "Base rent",
        period: invoice.period,
        quantity: 1,
        amount: invoice.rentAmount,
      },
      {
        line: "Variable charges",
        period: invoice.period,
        quantity: readings.length || 1,
        amount: invoice.variableAmount,
      },
    ];

    return excelFile(filename, [
      {
        name: "Act",
        rows: [
          excelRow(["sklad kontur closing act"], "Title"),
          excelRow(["Field", "Value"], "Header"),
          excelRow(["Act period", invoice.period]),
          excelRow(["Tenant", invoice.tenantName ?? ""]),
          excelRow(["Contract", invoice.contractNumber ?? ""]),
          excelRow(["Property", invoice.propertyName ?? ""]),
          excelRow(["Unit", invoice.unitNumber ?? ""]),
          excelRow(["Service total", invoice.totalAmount]),
          excelRow(["Paid", paidAmount]),
          excelRow(["Outstanding", outstanding]),
          excelRow(["Status", reconciliationStatus]),
        ].join(""),
      },
      {
        name: "Service lines",
        rows: tableRows(
          [
            { key: "line", label: "Line" },
            { key: "period", label: "Period" },
            { key: "quantity", label: "Quantity" },
            { key: "amount", label: "Amount" },
          ],
          serviceRows,
        ),
      },
      {
        name: "Reconciliation",
        rows: [
          excelRow(["Payment reconciliation"], "Title"),
          excelRow(["Field", "Value"], "Header"),
          excelRow(["Invoice total", invoice.totalAmount]),
          excelRow(["Paid", paidAmount]),
          excelRow(["Outstanding", outstanding]),
          excelRow(["Overpaid", overpaid]),
          excelRow(["Due date", invoice.dueDate]),
          excelRow(["Last paid at", payments[0]?.paidAt ?? ""]),
          excelRow(["Invoice status", invoice.status]),
          excelRow(["Reconciliation status", reconciliationStatus]),
        ].join(""),
      },
      {
        name: "Payments",
        rows: tableRows(
          [
            { key: "paidAt", label: "Paid at" },
            { key: "amount", label: "Amount" },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" },
          ],
          payments,
        ),
      },
      {
        name: "Meter readings",
        rows: tableRows(
          [
            { key: "period", label: "Period" },
            { key: "unitNumber", label: "Unit" },
            { key: "meterType", label: "Meter" },
            { key: "previousValue", label: "Previous" },
            { key: "value", label: "Current" },
            { key: "consumption", label: "Consumption" },
            { key: "tariffRate", label: "Tariff" },
            { key: "chargeAmount", label: "Charge" },
            { key: "recordedAt", label: "Recorded at" },
          ],
          readings,
        ),
      },
    ]);
  };

  const buildUnitExportFile = async (unitId, scoped, scopedTickets) => {
    const unit = scoped.units.find((item) => item.id === unitId);
    if (!unit) {
      return null;
    }

    const property =
      scoped.properties.find((item) => item.id === unit.propertyId) ?? null;
    const leases = scoped.leases.filter((lease) => lease.unitId === unit.id);
    const activeLease =
      leases.find((lease) => activeLeaseStages.has(lease.stage)) ?? null;
    const tenant = activeLease
      ? (scoped.tenants.find((item) => item.id === activeLease.tenantId) ??
        null)
      : null;
    const tickets = scopedTickets.filter((ticket) => ticket.unitId === unit.id);
    const documents = leases.flatMap((lease) =>
      db.listLeaseDocuments(lease.id).map((document) => ({
        contractNumber: lease.contractNumber,
        tenantName: lease.tenantName,
        fileName: document.file_name,
        category: document.document_category ?? "other",
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        uploadedByName:
          db.getById("users", document.uploaded_by)?.full_name ?? null,
        createdAt: document.created_at,
      })),
    );
    const monthlyRent = activeLease ? unit.area * activeLease.ratePerSqm : 0;
    const openTickets = tickets.filter((ticket) => isOpenTicket(ticket.status));
    const filename = sanitizeFilename(
      `unit-${property?.name ?? "property"}-${unit.number}.xls`,
    );

    return excelFile(filename, [
      {
        name: "Сводная",
        rows: [
          excelRow(["Паспорт помещения"], "Title"),
          excelRow(["Показатель", "Значение"], "Header"),
          excelRow(["Объект", property?.name ?? unit.propertyName ?? ""]),
          excelRow(["Адрес", property?.address ?? ""]),
          excelRow(["Помещение", unit.number]),
          excelRow(["Этаж", unit.floor]),
          excelRow(["Площадь, м2", unit.area]),
          excelRow(["Тип", unit.type]),
          excelRow(["Статус", unit.status]),
          excelRow(["Температурный режим", unit.temperatureRegime ?? ""]),
          excelRow(["Высота потолка", unit.ceilingHeight]),
          excelRow(["Рампа", unit.hasRamp ? "Да" : "Нет"]),
          excelRow(["Ворота", unit.hasGate ? "Да" : "Нет"]),
          excelRow([
            "Текущий арендатор",
            tenant?.name ?? unit.tenantName ?? "",
          ]),
          excelRow(["Активный договор", activeLease?.contractNumber ?? ""]),
          excelRow(["Месячная аренда", monthlyRent]),
          excelRow(["Открытых заявок", openTickets.length]),
        ].join(""),
      },
      {
        name: "Договоры",
        rows: tableRows(
          [
            { key: "contractNumber", label: "Номер договора" },
            { key: "tenantName", label: "Арендатор" },
            { key: "stage", label: "Стадия" },
            { key: "startDate", label: "Начало" },
            { key: "endDate", label: "Окончание" },
            { key: "ratePerSqm", label: "Ставка за м2" },
            { key: "deposit", label: "Депозит" },
            { key: "indexationPct", label: "Индексация %" },
          ],
          leases,
        ),
      },
      {
        name: "Заявки",
        rows: tableRows(
          [
            { key: "number", label: "Номер" },
            { key: "title", label: "Тема" },
            { key: "tenantName", label: "Арендатор" },
            { key: "category", label: "Категория" },
            { key: "priority", label: "Приоритет" },
            { key: "status", label: "Статус" },
            { key: "sourceChannel", label: "Канал" },
            { key: "assignedToName", label: "Исполнитель" },
            { key: "createdAt", label: "Создано" },
            { key: "updatedAt", label: "Обновлено" },
          ],
          tickets,
        ),
      },
      {
        name: "Документы",
        rows: tableRows(
          [
            { key: "contractNumber", label: "Договор" },
            { key: "tenantName", label: "Арендатор" },
            { key: "fileName", label: "Файл" },
            { key: "mimeType", label: "Тип" },
            { key: "sizeBytes", label: "Размер, байт" },
            { key: "uploadedByName", label: "Загрузил" },
            { key: "createdAt", label: "Загружено" },
          ],
          documents,
        ),
      },
    ]);
  };

  const buildImportTemplateFile = async (templateId) => {
    const templates = {
      tenants: {
        filename: "template-tenants.xls",
        headers: [
          { key: "name", label: "Название" },
          { key: "inn", label: "ИНН" },
          { key: "contactName", label: "Контактное лицо" },
          { key: "phone", label: "Телефон" },
          { key: "email", label: "Email" },
          { key: "riskLevel", label: "Риск" },
        ],
      },
      units: {
        filename: "template-units.xls",
        headers: [
          { key: "property", label: "Объект" },
          { key: "number", label: "Номер" },
          { key: "floor", label: "Этаж" },
          { key: "area", label: "Площадь" },
          { key: "type", label: "Тип" },
          { key: "temperatureRegime", label: "Температурный режим" },
          { key: "ceilingHeight", label: "Высота потолка" },
        ],
      },
      leases: {
        filename: "template-leases.xls",
        headers: [
          { key: "contractNumber", label: "Номер договора" },
          { key: "tenant", label: "Арендатор" },
          { key: "unit", label: "Помещение" },
          { key: "startDate", label: "Начало" },
          { key: "endDate", label: "Окончание" },
          { key: "ratePerSqm", label: "Ставка за м2" },
          { key: "deposit", label: "Депозит" },
        ],
      },
    };
    templates.payments = {
      filename: "template-payments.xls",
      headers: [
        { key: "invoiceId", label: "Invoice ID" },
        { key: "contractNumber", label: "Contract number" },
        { key: "period", label: "Period YYYY-MM" },
        { key: "tenant", label: "Tenant" },
        { key: "amount", label: "Amount" },
        { key: "paidAt", label: "Paid at YYYY-MM-DD" },
        { key: "method", label: "Method" },
        { key: "reference", label: "Reference" },
      ],
    };

    const template = templates[templateId];
    if (!template) {
      return null;
    }

    return excelFile(template.filename, [
      {
        name: "Шаблон",
        rows: tableRows(template.headers, []),
      },
      {
        name: "Сводная",
        rows: [
          excelRow(["Шаблон импорта"], "Title"),
          excelRow(["Раздел", templateId]),
          excelRow(["Колонок", template.headers.length]),
        ].join(""),
      },
    ]);
  };

  const buildBillingReconciliationFile = async (user) => {
    const reconciliation = buildBillingReconciliation(user);
    return excelFile("billing-reconciliation.xlsx", [
      {
        name: "Summary",
        rows: [
          excelRow(["sklad kontur billing reconciliation"], "Title"),
          excelRow(["Metric", "Value"], "Header"),
          excelRow(["Invoices", reconciliation.summary.invoices]),
          excelRow(["Billed", reconciliation.summary.billed]),
          excelRow(["Paid", reconciliation.summary.paid]),
          excelRow(["Outstanding", reconciliation.summary.outstanding]),
          excelRow(["Overpaid", reconciliation.summary.overpaid]),
          excelRow(["Matched", reconciliation.summary.matched]),
          excelRow(["Issues", reconciliation.summary.issues]),
          excelRow([
            "Collection rate, %",
            reconciliation.summary.collectionRate,
          ]),
        ].join(""),
      },
      {
        name: "Reconciliation",
        rows: tableRows(
          [
            { key: "period", label: "Period" },
            { key: "tenantName", label: "Tenant" },
            { key: "contractNumber", label: "Contract" },
            { key: "propertyName", label: "Property" },
            { key: "unitNumber", label: "Unit" },
            { key: "totalAmount", label: "Invoice total" },
            { key: "paidAmount", label: "Paid" },
            { key: "outstandingAmount", label: "Outstanding" },
            { key: "overpaidAmount", label: "Overpaid" },
            { key: "dueDate", label: "Due date" },
            { key: "lastPaidAt", label: "Last paid at" },
            { key: "reconciliationStatus", label: "Reconciliation status" },
            { key: "issue", label: "Issue" },
            { key: "paymentCount", label: "Payments" },
          ],
          reconciliation.rows,
        ),
      },
    ]);
  };
  return {
    buildExportFile,
    buildBillingInvoiceExportFile,
    buildBillingClosingPackFile,
    buildUnitExportFile,
    buildImportTemplateFile,
    buildBillingReconciliationFile,
  };
}
