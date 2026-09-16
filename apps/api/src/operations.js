import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { isOpenTicket, requireNumber, requireDate } from '../../../packages/contracts/src/domain.js';

const id = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
export const specialties = ['plumber', 'electrician', 'technician', 'builder', 'cleaner', 'contractor', 'engineer', 'dispatcher'];
const text = (value, label, required = false) => {
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > 10000) throw new Error(`${label}: заполните поле (до 10000 символов)`);
  return result;
};
function photo(value) {
  const result = String(value ?? '');
  if (result && !/^https:\/\//.test(result) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(result)) throw new Error('Фото: используйте HTTPS или PNG, JPEG, WebP');
  if (result.length > 3 * 1024 * 1024) throw new Error('Фото: максимальный размер 2 МБ');
  return result;
}
export function publicUser(user) {
  return { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone, role: user.role, propertyId: user.property_id, tenantId: user.tenant_id, isActive: user.is_active === 1, specialty: user.specialty ?? '', lastLoginAt: user.last_login_at };
}
export function operationsScope(db, user) {
  const leases = db.data.leases.filter(l => l.tenant_id === user.tenant_id && l.stage !== 'terminated');
  const unitIds = new Set(leases.map(l => l.unit_id));
  const propertyIds = new Set(db.data.units.filter(u => unitIds.has(u.id)).map(u => u.property_id));
  return propertyId => user.role === 'admin' || (user.role === 'tenant' ? propertyIds.has(propertyId) : !user.property_id || propertyId === user.property_id);
}
function checkProperty(db, user, propertyId) {
  db.requireProperty(propertyId);
  if (!operationsScope(db, user)(propertyId)) throw Object.assign(new Error('Нет доступа к объекту'), { status: 403 });
}
function checkUnit(db, user, unitId, propertyId) {
  const unit = db.requireUnit(unitId);
  checkProperty(db, user, unit.property_id);
  if (unit.property_id !== propertyId) throw new Error('Помещение относится к другому объекту');
  return unit;
}
function responsible(db, propertyId, userId) {
  if (!userId) return null;
  const user = db.getUserById(userId);
  if (!user || !user.is_active || user.role === 'tenant' || (user.property_id && user.property_id !== propertyId)) throw new Error('Ответственный недоступен на этом объекте');
  return userId;
}
export function validateTicketLinks(db, user, payload, previous = null) {
  if (previous?.work_logs?.length && payload.serviceId !== undefined && payload.serviceId !== previous.service_id) throw new Error("Нельзя менять услугу после учёта работ");
  const unit = db.requireUnit(payload.unitId ?? previous?.unit_id);
  checkProperty(db, user, unit.property_id);
  const tenantId = payload.tenantId !== undefined ? payload.tenantId : previous?.tenant_id;
  if (tenantId && !db.data.leases.some(l => l.tenant_id === tenantId && l.unit_id === unit.id && l.stage !== 'terminated')) throw new Error('Арендатор не связан с этим помещением');
  if (payload.assignedTo) responsible(db, unit.property_id, payload.assignedTo);
  for (const [key, collection, storedKey] of [['equipmentId', 'equipment', 'equipment_id'], ['serviceId', 'service_catalog', 'service_id'], ['leaseId', 'leases', 'lease_id']]) {
    const value = payload[key] !== undefined ? payload[key] : previous?.[storedKey];
    if (!value) continue;
    const record = db.data[collection].find(r => r.id === value);
    if (!record || (collection === 'leases' ? record.unit_id !== unit.id || (tenantId && record.tenant_id !== tenantId) : record.propertyId !== unit.property_id || (record.unitId && record.unitId !== unit.id))) throw new Error('Связанная сущность не относится к помещению заявки');
  }
}
export function runMaintenance(db, date = today()) {
  const generated = [];
  db.transaction(() => {
    for (const plan of db.data.maintenance_plans) {
      if (!plan.active) continue;
      let limit = 24;
      while (plan.nextDate <= date && limit-- > 0) {
        const occurrence = plan.nextDate;
        if (!db.data.tickets.some(t => t.maintenance_plan_id === plan.id && t.maintenance_date === occurrence)) {
          const assigned = db.getUserById(plan.responsibleId);
          const ticket = db.createTicket({ unitId: plan.unitId, createdBy: plan.createdBy, assignedTo: assigned?.is_active ? assigned.id : null, category: 'maintenance', priority: 'medium', title: `ППР: ${plan.name} · ${occurrence}`, description: plan.instructions || plan.name, equipmentId: plan.equipmentId, maintenancePlanId: plan.id, slaDueAt: `${occurrence}T23:59:59.999Z`, checklistItems: plan.checklist.map(label => ({ id: id(), label, required: true, completed: false, completed_at: null, completed_by: null })) });
          db.getById('tickets', ticket.id).maintenance_date = occurrence;
          generated.push(ticket.id);
        }
        const next = new Date(`${occurrence}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + plan.intervalDays);
        plan.nextDate = next.toISOString().slice(0, 10);
      }
    }
  });
  return generated;
}
export function updateUser(db, actor, userId, body) {
  const user = db.getUserById(userId);
  if (!user) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });
  if (actor.role !== 'admin' && !(actor.role === 'manager' && user.role === 'worker' && operationsScope(db, actor)(user.property_id))) throw Object.assign(new Error('Нет доступа к пользователю'), { status: 403 });
  const role = body.role ?? user.role;
  if (!['admin', 'manager', 'worker', 'tenant'].includes(role) || (user.role === 'tenant' && role !== 'tenant') || (user.role !== 'tenant' && role === 'tenant')) throw new Error('Нельзя изменить тип учётной записи арендатора');
  if (actor.role !== 'admin' && role !== 'worker') throw Object.assign(new Error('Недостаточно прав для назначения роли'), { status: 403 });
  const propertyId = role === 'admin' || role === 'tenant' ? null : body.propertyId ?? user.property_id;
  if (propertyId) checkProperty(db, actor, propertyId);
  if (role !== 'admin' && role !== 'tenant' && !propertyId) throw new Error('Выберите объект');
  const active = body.isActive === undefined ? user.is_active === 1 : body.isActive === true;
  if (actor.id === user.id && (!active || role !== user.role)) throw new Error('Нельзя заблокировать себя или изменить собственную роль');
  if (user.role === 'admin' && user.is_active && (!active || role !== 'admin') && db.data.users.filter(u => u.role === 'admin' && u.is_active).length <= 1) throw new Error('Должен оставаться активный администратор');
  const email = text(body.email ?? user.email, 'Email', role !== 'tenant').toLowerCase();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || db.data.users.some(u => u.id !== userId && u.email?.toLowerCase() === email))) throw new Error('Email некорректен или уже используется');
  const phone = text(body.phone ?? user.phone, 'Телефон');
  if (phone && db.data.users.some(u => u.id !== userId && u.phone === phone)) throw new Error('Телефон уже используется');
  const specialty = body.specialty ?? user.specialty ?? '';
  if (specialty && !specialties.includes(specialty)) throw new Error('Неизвестная специализация');
  if (body.password && String(body.password).length < 10) throw new Error('Пароль должен содержать не менее 10 символов');
  return db.transaction(() => {
    const record = db.getById('users', userId);
    Object.assign(record, { full_name: text(body.fullName ?? user.full_name, 'Имя', true), email: email || null, phone: phone || null, role, property_id: propertyId, is_active: active ? 1 : 0, specialty });
    if (body.password) record.password_hash = hashPassword(body.password);
    db.audit(actor, 'user_updated', 'user', userId, { before: publicUser(user), after: publicUser(record), passwordChanged: Boolean(body.password) });
    return publicUser(record);
  });
}
const collections = { floorplans: 'floor_plans', equipment: 'equipment', services: 'service_catalog', plans: 'maintenance_plans', meters: 'meters', news: 'announcements', expenses: 'operating_expenses' };
export function saveOperation(db, user, kind, recordId, body) {
  if (!['admin', 'manager'].includes(user.role)) throw Object.assign(new Error('Недостаточно прав'), { status: 403 });
  const collection = collections[kind];
  if (!collection) throw new Error('Неизвестный раздел');
  const existing = recordId ? structuredClone(db.getById(collection, recordId)) : null;
  if (recordId && !existing) throw Object.assign(new Error('Запись не найдена'), { status: 404 });
  if (existing) checkProperty(db, user, existing.propertyId);
  if (existing && body.updatedAt && body.updatedAt !== existing.updatedAt) throw Object.assign(new Error('Запись уже изменена другим пользователем. Обновите страницу.'), {status: 409});
  const input = { ...existing, ...body };
  const propertyId = input.propertyId;
  checkProperty(db, user, propertyId);
  if (existing && propertyId !== existing.propertyId) throw new Error('Перенос записи между объектами не поддерживается');
  const record = { id: existing?.id ?? id(), propertyId, name: text(input.name, 'Название', true), createdBy: existing?.createdBy ?? user.id, createdAt: existing?.createdAt ?? now(), updatedAt: now() };
  if (['equipment', 'plans'].includes(kind)) {
    checkUnit(db, user, input.unitId, propertyId);
    record.unitId = input.unitId;
    record.responsibleId = responsible(db, propertyId, input.responsibleId);
  }
  if (kind === 'floorplans') {
    const markers = Array.isArray(input.markers) ? input.markers : [];
    if (markers.length > 2000) throw new Error('Слишком много меток');
    const unique = new Set();
    record.markers = markers.map(m => {
      checkUnit(db, user, m.unitId, propertyId);
      if (unique.has(m.unitId)) throw new Error('Повторная метка помещения');
      unique.add(m.unitId);
      return {unitId: m.unitId, x: requireNumber(m.x, 'X', 0, 100), y: requireNumber(m.y, 'Y', 0, 100)};
    });
    record.image = photo(input.image);
    if (!record.image) throw new Error('Загрузите изображение плана');
  }
  if (kind === 'equipment') {
    Object.assign(record, { type: text(input.type, 'Тип', true), serialNumber: text(input.serialNumber, 'Серийный номер'), specifications: text(input.specifications, 'Характеристики'), warrantyUntil: input.warrantyUntil ? requireDate(input.warrantyUntil, 'Гарантия') : null, cost: requireNumber(input.cost ?? 0, 'Стоимость'), photoUrl: photo(input.photoUrl), status: input.status ?? 'active' });
    if (!['active', 'maintenance', 'retired'].includes(record.status)) throw new Error('Некорректный статус оборудования');
    if (existing && existing.unitId !== record.unitId && (db.data.maintenance_plans.some(p => p.equipmentId === record.id) || db.data.tickets.some(t => t.equipment_id === record.id))) throw new Error('Оборудование связано с заявками или ППР: измените привязки перед переносом');
  }
  if (kind === 'services') {
    Object.assign(record, { paid: input.paid === true, hourlyRate: requireNumber(input.hourlyRate ?? 0, 'Тариф'), basePrice: requireNumber(input.basePrice ?? 0, 'Базовая стоимость'), description: text(input.description, 'Описание'), specialty: input.specialty || '', active: input.active !== false });
    if (record.specialty && !specialties.includes(record.specialty)) throw new Error('Неизвестная специализация');
  }
  if (kind === 'plans') {
    const equipment = input.equipmentId ? db.getById('equipment', input.equipmentId) : null;
    if (input.equipmentId && (!equipment || equipment.unitId !== record.unitId || equipment.status === 'retired')) throw new Error('Оборудование недоступно в помещении');
    const checklist = (Array.isArray(input.checklist) ? input.checklist : String(input.checklist ?? '').split('\n')).map(v => text(v, 'Пункт чек-листа')).filter(Boolean);
    if (!checklist.length || checklist.length > 100) throw new Error('Добавьте от 1 до 100 пунктов чек-листа');
    Object.assign(record, { equipmentId: equipment?.id ?? null, nextDate: requireDate(input.nextDate, 'Дата ППР'), intervalDays: requireNumber(input.intervalDays, 'Интервал', 1, 3660), checklist, instructions: text(input.instructions, 'Инструкция'), active: input.active !== false });
    if (!Number.isInteger(record.intervalDays)) throw new Error('Интервал должен быть целым числом дней');
  }
  if (kind === 'meters') {
    const scope = input.scope ?? 'individual';
    if (!['individual', 'common'].includes(scope)) throw new Error('Некорректный тип счётчика');
    if (input.unitId) checkUnit(db, user, input.unitId, propertyId);
    if (scope === 'individual' && !input.unitId) throw new Error('У индивидуального счётчика должно быть помещение');
    if (!['electricity', 'water', 'heating'].includes(input.resource)) throw new Error('Неизвестный ресурс');
    if (existing && db.data.resource_readings.some(r => r.meterId === record.id) && (input.unitId !== existing.unitId || scope !== existing.scope || input.resource !== existing.resource)) throw new Error('Нельзя менять ресурс и привязку счётчика с показаниями');
    Object.assign(record, { unitId: input.unitId || null, scope, resource: input.resource, serialNumber: text(input.serialNumber, 'Номер'), tariff: requireNumber(input.tariff, 'Тариф'), initialValue: requireNumber(input.initialValue ?? 0, 'Начальное показание'), responsibleId: responsible(db, propertyId, input.responsibleId), active: input.active !== false });
    if (existing && db.data.resource_readings.some(r => r.meterId === record.id) && record.initialValue !== existing.initialValue) throw new Error('Начальное показание уже использовано');
  }
  if (kind === 'news') {
    Object.assign(record, { content: text(input.content, 'Текст', true), tone: input.tone ?? 'info', audience: input.audience ?? 'all', published: input.published !== false, expiresAt: input.expiresAt ? requireDate(input.expiresAt, 'Срок публикации') : null });
    if (!['info', 'warning', 'critical', 'success'].includes(record.tone) || !['all', 'staff', 'tenants'].includes(record.audience)) throw new Error('Некорректная аудитория или важность');
  }
  if (kind === 'expenses') Object.assign(record, { amount: requireNumber(input.amount, 'Сумма', 0.01), date: requireDate(input.date, 'Дата'), category: text(input.category || 'Эксплуатация', 'Категория') });
  return db.transaction(() => {
    if (existing) Object.assign(db.getById(collection, record.id), record); else db.data[collection].push(record);
    db.audit(user, existing ? 'updated' : 'created', kind, record.id, { before: existing, after: record });
    return record;
  });
}
export function addReading(db, user, meterId, body) {
  const meter = db.getById('meters', meterId);
  if (!meter || !meter.active) throw new Error('Счётчик не найден или выключен');
  checkProperty(db, user, meter.propertyId);
  if (!['admin', 'manager'].includes(user.role) && !(user.role === 'worker' && meter.responsibleId === user.id)) throw Object.assign(new Error('Нет прав на ввод показаний'), { status: 403 });
  const period = text(body.period, 'Период', true);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > today().slice(0, 7)) throw new Error('Укажите текущий или прошедший месяц');
  const readings = db.data.resource_readings.filter(r => r.meterId === meterId).sort((a, b) => b.period.localeCompare(a.period));
  if (readings[0] && readings[0].period >= period) throw new Error('Показание этого или более позднего периода уже внесено');
  const previous = readings[0]?.value ?? meter.initialValue;
  const value = requireNumber(body.value, 'Показание', previous);
  const consumption = Math.round((value - previous) * 1000) / 1000;
  const total = Math.round(consumption * meter.tariff * 100) / 100;
  const periodEnd = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const eligible = db.data.leases.filter(l => ['signed', 'active', 'prolongation'].includes(l.stage) && l.start_date <= periodEnd && l.end_date >= `${period}-01` && db.getUnitById(l.unit_id)?.property_id === meter.propertyId && (meter.scope === 'common' || l.unit_id === meter.unitId));
  // A tenant occupying a unit for part of the month pays only its share of area-days.
  const weights = eligible.map(l => ({ lease: l, weight: db.getUnitById(l.unit_id).area * (1 + (Date.parse(l.end_date < periodEnd ? l.end_date : periodEnd) - Date.parse(l.start_date > `${period}-01` ? l.start_date : `${period}-01`)) / 86400000) }));
  const denominator = weights.reduce((sum, row) => sum + row.weight, 0);
  let allocated = 0;
  const allocations = weights.map(({ lease, weight }, index) => {
    const amount = index === weights.length - 1 ? Math.round((total - allocated) * 100) / 100 : Math.round(total * weight / denominator * 100) / 100;
    allocated += amount;
    return { tenantId: lease.tenant_id, leaseId: lease.id, unitId: lease.unit_id, amount, share: weight / denominator };
  });
  const record = { id: id(), meterId, propertyId: meter.propertyId, period, previous, value, consumption, tariff: meter.tariff, amount: total, allocations, unallocated: weights.length ? 0 : total, createdBy: user.id, createdAt: now() };
  return db.transaction(() => { db.data.resource_readings.push(record); db.audit(user, 'reading_added', 'meter', meterId, record); return record; });
}
export function addWorkLog(db, user, ticketId, body) {
  const ticket = db.getById('tickets', ticketId);
  if (!ticket) throw new Error('Заявка не найдена');
  checkProperty(db, user, ticket.property_id);
  if (!['admin', 'manager'].includes(user.role) && !(user.role === 'worker' && ticket.assigned_to === user.id)) throw Object.assign(new Error('Нет прав на учёт работ'), { status: 403 });
  if (!isOpenTicket(ticket.status)) throw new Error('Учёт работ закрыт: сначала возобновите заявку');
  const service = db.getById('service_catalog', ticket.service_id);
  const hours = requireNumber(body.hours ?? 0, 'Часы', 0, 744);
  const materialCost = requireNumber(body.materialCost ?? 0, 'Стоимость ТМЦ');
  const record = { id: id(), description: text(body.description, 'Работа / ТМЦ', true), hours, hourlyRate: service?.hourlyRate ?? 0, materialCost, cost: Math.round((hours * (service?.hourlyRate ?? 0) + materialCost) * 100) / 100, createdBy: user.id, createdByName: user.full_name, createdAt: now() };
  return db.transaction(() => { (ticket.work_logs ??= []).push(record); db.audit(user, 'work_logged', 'ticket', ticketId, record); return record; });
}
export function getOperations(db, user) {
  const scope = operationsScope(db, user);
  const staff = user.role !== 'tenant';
  const manager = ['admin', 'manager'].includes(user.role);
  const result = {};
  for (const [key, collection] of Object.entries(collections)) {
    let rows = db.data[collection].filter(r => scope(r.propertyId));
    if (!staff && !['services', 'news'].includes(key)) rows = [];
    if (key === 'expenses' && !manager) rows = [];
    if (key === 'news') rows = rows.filter(r => manager || r.published && (!r.expiresAt || r.expiresAt >= today()) && (r.audience === 'all' || r.audience === (staff ? 'staff' : 'tenants')));
    if (key === 'services' && !manager) rows = rows.filter(r => r.active);
    result[key] = rows;
  }
  result.readings = staff ? db.data.resource_readings.filter(r => scope(r.propertyId)) : [];
  result.users = manager ? db.data.users.filter(u => user.role === 'admin' || u.role === 'worker' && scope(u.property_id)).map(publicUser) : [];
  result.audit = user.role === 'admin' ? db.data.audit_log.slice(-200).reverse() : [];
  return result;
}
