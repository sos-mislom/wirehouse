import { parseJsonBody } from "../http/body.js";
export function createBillingRoutes({
  requireAuth,
  forbidden,
  getScopedBillingInvoice,
  notFound,
  buildBillingInvoiceExportFile,
  buildBillingClosingPackFile,
  ok,
  buildBillingReconciliation,
  buildBillingReconciliationFile,
  getScopedBillingInvoices,
  db,
  normalizeBillingPayment,
  getScopedMeterReadings,
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  buildScopedCollections,
  created,
  normalizeMeterReading,
  getScopedLease,
  normalizeBillingInvoice,
}) {
  return async function billingRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    const billingInvoiceExportMatch = pathname.match(
      /^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/export$/,
    );

    if (billingInvoiceExportMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const invoice = getScopedBillingInvoice(
        user,
        billingInvoiceExportMatch[1],
      );
      if (!invoice) {
        notFound(response);
        return true;
      }

      const file = await buildBillingInvoiceExportFile(invoice);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }

    const billingInvoiceClosingPackMatch = pathname.match(
      /^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/closing-pack$/,
    );

    if (billingInvoiceClosingPackMatch && method === "GET") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const invoice = getScopedBillingInvoice(
        user,
        billingInvoiceClosingPackMatch[1],
      );
      if (!invoice) {
        notFound(response);
        return true;
      }

      const file = await buildBillingClosingPackFile(invoice);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }

    if (method === "GET" && pathname === "/api/billing/reconciliation") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      ok(response, buildBillingReconciliation(user));
      return true;
    }

    if (method === "GET" && pathname === "/api/billing/reconciliation/export") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const file = await buildBillingReconciliationFile(user);
      response.writeHead(200, {
        "Content-Type": file.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      response.end(file.content);
      return true;
    }

    if (method === "GET" && pathname === "/api/billing/invoices") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      let items = getScopedBillingInvoices(user);
      const tenantId = url.searchParams.get("tenantId");
      const leaseId = url.searchParams.get("leaseId");
      const status = url.searchParams.get("status");
      if (tenantId) {
        items = items.filter((invoice) => invoice.tenantId === tenantId);
      }
      if (leaseId) {
        items = items.filter((invoice) => invoice.leaseId === leaseId);
      }
      if (status) {
        items = items.filter((invoice) => invoice.status === status);
      }

      ok(response, { items });
      return true;
    }

    if (method === "GET" && pathname === "/api/billing/payments") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      const invoiceIds = new Set(
        getScopedBillingInvoices(user).map((invoice) => invoice.id),
      );
      const items = db
        .listBillingPayments()
        .filter((payment) => invoiceIds.has(payment.invoice_id))
        .map(normalizeBillingPayment);
      ok(response, { items });
      return true;
    }

    if (method === "GET" && pathname === "/api/meter-readings") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      let items = getScopedMeterReadings(user);
      const tenantId = url.searchParams.get("tenantId");
      const unitId = url.searchParams.get("unitId");
      const period = url.searchParams.get("period");
      if (tenantId) {
        items = items.filter((reading) => reading.tenantId === tenantId);
      }
      if (unitId) {
        items = items.filter((reading) => reading.unitId === unitId);
      }
      if (period) {
        items = items.filter((reading) => reading.period === period);
      }

      ok(response, { items });
      return true;
    }

    if (method === "POST" && pathname === "/api/meter-readings") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "unitId",
        "period",
        "meterType",
        "value",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      const scoped = buildScopedCollections(user);
      if (!scoped.units.some((unit) => unit.id === body.unitId)) {
        notFound(response);
        return true;
      }

      try {
        const item = db.createMeterReading({
          unitId: String(body.unitId),
          tenantId: body.tenantId ? String(body.tenantId) : undefined,
          period: String(body.period),
          meterType: String(body.meterType),
          value: body.value,
          previousValue: body.previousValue,
          tariffRate: body.tariffRate,
          chargeAmount: body.chargeAmount,
          recordedAt: body.recordedAt ? String(body.recordedAt) : undefined,
        });
        created(response, { item: normalizeMeterReading(item) });
      } catch (error) {
        badRequest(
          response,
          error instanceof Error
            ? error.message
            : "Meter reading create failed",
        );
      }
      return true;
    }

    if (method === "GET" && pathname === "/api/checklist-templates") {
      const user = requireAuth(request, response);
      if (!user) {
        return true;
      }
      if (!["admin", "manager", "worker"].includes(user.role)) {
        forbidden(response);
        return true;
      }

      ok(response, {
        items: db.listChecklistTemplates(),
      });
      return true;
    }

    if (method === "POST" && pathname === "/api/billing/invoices") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["leaseId", "period", "dueDate"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }
      if (!getScopedLease(user, body.leaseId)) {
        notFound(response);
        return true;
      }

      try {
        const item = db.createBillingInvoice({
          leaseId: String(body.leaseId),
          period: String(body.period),
          rentAmount: body.rentAmount,
          variableAmount: body.variableAmount,
          totalAmount: body.totalAmount,
          dueDate: String(body.dueDate),
        });
        created(response, { item: normalizeBillingInvoice(item) });
      } catch (error) {
        badRequest(
          response,
          error instanceof Error ? error.message : "Invoice create failed",
        );
      }
      return true;
    }

    const invoicePaymentMatch = pathname.match(
      /^\/api\/billing\/invoices\/([a-zA-Z0-9-]+)\/payments$/,
    );

    if (invoicePaymentMatch && method === "POST") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const invoice = getScopedBillingInvoice(user, invoicePaymentMatch[1]);
      if (!invoice) {
        notFound(response);
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, ["amount"]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      try {
        const item = db.createBillingPayment({
          invoiceId: invoice.id,
          amount: body.amount,
          paidAt: body.paidAt ? String(body.paidAt) : undefined,
          method: body.method ? String(body.method) : undefined,
          reference: body.reference ? String(body.reference) : undefined,
        });
        created(response, { item: normalizeBillingPayment(item) });
      } catch (error) {
        badRequest(
          response,
          error instanceof Error ? error.message : "Payment create failed",
        );
      }
      return true;
    }
    return false;
  };
}
