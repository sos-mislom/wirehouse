export function createDocumentsService({}) {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const buildLeaseDocumentHtml = (lease) => `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(lease.contractNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1f2933; line-height: 1.55; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .muted { color: #64748b; margin-bottom: 28px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    td { border: 1px solid #d9e0e8; padding: 12px 14px; vertical-align: top; }
    td:first-child { width: 32%; color: #52616f; background: #f6f8fa; }
    .sign { margin-top: 44px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .line { border-top: 1px solid #94a3b8; padding-top: 10px; color: #52616f; }
  </style>
</head>
<body>
  <h1>Договор аренды ${escapeHtml(lease.contractNumber)}</h1>
  <div class="muted">Сформировано системой склад контур</div>
  <table>
    <tr><td>Арендатор</td><td>${escapeHtml(lease.tenantName)}</td></tr>
    <tr><td>Объект</td><td>${escapeHtml(lease.propertyName)}</td></tr>
    <tr><td>Помещение</td><td>${escapeHtml(lease.unitNumber)}</td></tr>
    <tr><td>Стадия</td><td>${escapeHtml(lease.stage)}</td></tr>
    <tr><td>Срок</td><td>${escapeHtml(lease.startDate)} - ${escapeHtml(lease.endDate)}</td></tr>
    <tr><td>Ставка за м²</td><td>${Number(lease.ratePerSqm).toLocaleString("ru-RU")} ₽</td></tr>
    <tr><td>Депозит</td><td>${Number(lease.deposit).toLocaleString("ru-RU")} ₽</td></tr>
    <tr><td>Индексация</td><td>${Number(lease.indexationPct).toLocaleString("ru-RU")}%</td></tr>
  </table>
  <p>Документ является операционной карточкой договора. Для юридически значимой версии подключается файл договора или ЭДО.</p>
  <div class="sign">
    <div class="line">Управляющая компания</div>
    <div class="line">Арендатор</div>
  </div>
</body>
</html>`;
  return { escapeHtml, buildLeaseDocumentHtml };
}
