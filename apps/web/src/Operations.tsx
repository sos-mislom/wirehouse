import { BotLinkPanel } from "./MessengerButtons";
import { useEffect, useState, type FormEvent } from 'react';
import { isOpenTicket } from '../../../packages/contracts/src/domain.js';

type Row = { id: string; propertyId?: string; name?: string; [key: string]: any };
type Unit = { id: string; propertyId: string; number: string; floor: number; building?: string; entrance?: string; area: number; status: string; tenantName?: string | null; photoUrl?: string };
type Ticket = { id: string; unitId: string; title: string; status: string; number: string; equipmentId?: string | null; serviceId?: string | null; leaseId?: string | null; maintenancePlanId?: string | null; workLogs?: Row[]; assignedToName?: string | null; createdAt?: string };
type Overview = { properties: {id: string; name: string}[]; units: Unit[]; leases?: {id: string; unitId: string; tenantId: string; contractNumber: string; stage: string}[]; tenants?: {id: string; name: string}[] };
export type OperationsData = { equipment: Row[]; services: Row[]; plans: Row[]; meters: Row[]; news: Row[]; expenses: Row[]; readings: Row[]; users: Row[]; audit: Row[]; floorplans: Row[] };
const emptyData: OperationsData = { equipment: [], services: [], plans: [], meters: [], news: [], expenses: [], readings: [], users: [], audit: [], floorplans: [] };
const specialtyNames: Record<string, string> = { plumber: 'Сантехник', electrician: 'Электрик', technician: 'Техник', builder: 'Строитель', cleaner: 'Уборщик', contractor: 'Подрядчик', engineer: 'Инженер', dispatcher: 'Диспетчер' };
const roleNames: Record<string, string> = { admin: 'Администратор', manager: 'Менеджер', worker: 'Исполнитель', tenant: 'Арендатор' };
const statusNames: Record<string, string> = { active: 'В эксплуатации', maintenance: 'На обслуживании', retired: 'Списано', new: 'Новая', accepted: 'Принята', in_progress: 'В работе', completed: 'Выполнена', closed: 'Закрыта', resolved: 'Решена', rejected: 'Отменена', waiting_tenant: 'Ожидание', deferred: 'Отложена' };
const resourceNames: Record<string, string> = { electricity: 'Электричество', water: 'Вода', heating: 'Отопление' };
const currency = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value || 0);
const date = (value?: string) => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
const apiBase = import.meta.env.VITE_WAREHOUSE_API_BASE_URL || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:3001' : '');
async function request<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изменения');
  return payload;
}
const tabs: Record<string, string> = { equipment: 'Оборудование', plans: 'ППР', services: 'Услуги', meters: 'Счётчики', news: 'Объявления', expenses: 'Расходы', users: 'Пользователи', audit: 'Аудит' };
type Props = { token: string; user: {role: string; id: string}; overview: Overview; tickets: Ticket[]; onRefresh: () => Promise<unknown>; onUnit: (id: string) => void; onTicket: (id: string) => void; initialTab?: string; onCreateUser?: () => void };
export function Operations({ token, user, overview, tickets, onRefresh, onUnit, onTicket, initialTab = 'equipment', onCreateUser }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<OperationsData>(emptyData);
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [property, setProperty] = useState('');
  const [query, setQuery] = useState('');
  const [readingMeter, setReadingMeter] = useState('');
  const [readingPeriod, setReadingPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [readingValue, setReadingValue] = useState('');
  const load = async () => setData(await request<OperationsData>('/api/operations', token));
  useEffect(() => { let active = true; request<OperationsData>('/api/operations', token).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [token]);
  const change = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value }));
  const create = () => {
    setError(''); setDraft({ propertyId: property || overview.properties[0]?.id || '', name: '', unitId: '', responsibleId: '', type: '', cost: 0, status: 'active', intervalDays: 30, nextDate: new Date().toISOString().slice(0, 10), checklist: '', active: true, paid: false, basePrice: 0, hourlyRate: 0, tariff: 0, initialValue: 0, scope: 'individual', resource: 'electricity', audience: 'all', tone: 'info', published: true, date: new Date().toISOString().slice(0, 10), amount: '' });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || busy) return; setBusy(true); setError('');
    try {
      await request(tab === 'users' ? `/api/users/${draft.id}` : `/api/operations/${tab}${draft.id ? `/${draft.id}` : ''}`, token, draft.id ? 'PUT' : 'POST', draft);
      await load(); await onRefresh(); setDraft(null); setNotice('Изменения сохранены');
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const submitReading = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await request(`/api/operations/meters/${readingMeter}/readings`, token, 'POST', { period: readingPeriod, value: Number(readingValue) }); await load(); setReadingMeter(''); setReadingValue(''); setNotice('Показания и распределение сохранены'); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const input = (key: string, label: string, type = 'text', required = false, hint = '') => <label key={key}><span>{label}{required ? ' *' : ''}</span><input type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={draft?.[key] ?? ''} onChange={event => change(key, event.target.value)} />{hint && <small className="field-hint">{hint}</small>}</label>;
  const area = (key: string, label: string, required = false) => <label className="form-wide" key={key}><span>{label}{required ? ' *' : ''}</span><textarea required={required} rows={4} value={Array.isArray(draft?.[key]) ? draft[key].join('\n') : draft?.[key] ?? ''} onChange={event => change(key, event.target.value)} /></label>;
  const select = (key: string, label: string, options: Record<string, string>, required = false) => <label key={key}><span>{label}{required ? ' *' : ''}</span><select required={required} value={draft?.[key] ?? ''} onChange={event => change(key, event.target.value)}><option value="">Выберите</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const check = (key: string, label: string) => <label className="check-field" key={key}><input type="checkbox" checked={Boolean(draft?.[key])} onChange={event => change(key, event.target.checked)} /><span>{label}</span></label>;
  const units = Object.fromEntries(overview.units.filter(u => u.propertyId === draft?.propertyId).map(u => [u.id, `${u.building || 'Основной корпус'} / ${u.floor} этаж / ${u.number}`]));
  const workers = Object.fromEntries(data.users.filter(u => u.isActive && u.role !== 'tenant' && (!u.propertyId || u.propertyId === draft?.propertyId)).map(u => [u.id, `${u.fullName} · ${specialtyNames[u.specialty] || roleNames[u.role]}`]));
  const rows = (data[tab as keyof OperationsData] || []).filter(r => (!property || r.propertyId === property) && `${r.name || r.fullName || ''} ${r.serialNumber || ''} ${r.email || ''}`.toLowerCase().includes(query.toLowerCase()));
  const unitName = (id?: string) => overview.units.find(u => u.id === id)?.number || 'Общие зоны';
  return <section className="mvp-page operations-page">
    <div className="mvp-page-header"><div><h2>{initialTab === 'users' ? 'Пользователи и доступ' : 'Эксплуатация'}</h2></div></div>
    <div className="mvp-tabs">{Object.entries(tabs).filter(([key]) => (initialTab === 'users' ? ['users', 'audit'].includes(key) : !['users', 'audit'].includes(key)) && (key !== 'audit' || user.role === 'admin')).map(([key, label]) => <button type="button" className={`mvp-tab ${tab === key ? 'mvp-tab--active' : ''}`} key={key} onClick={() => { setTab(key); setDraft(null); setError(''); setQuery(''); setProperty(''); }}>{label}</button>)}</div>
    {error && <div className="notice notice--error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <div className="mvp-actions"><input aria-label="Поиск" placeholder="Поиск по названию или номеру" value={query} onChange={e => setQuery(e.target.value)} />{tab !== 'audit' && tab !== 'users' && <select aria-label="Объект" value={property} onChange={e => setProperty(e.target.value)}><option value="">Все объекты</option>{overview.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}<span>Найдено: {rows.length}</span>{tab !== 'audit' && <button className="primary-button" type="button" onClick={tab === 'users' ? onCreateUser : create} disabled={tab === 'users' && !onCreateUser}>Добавить</button>}</div>
    {tab === 'users' && <p className="field-hint">Администратор управляет всем портфелем; менеджер — своим объектом и исполнителями; исполнитель — назначенными заявками; арендатор — своими помещениями и обращениями. Блокировка отзывает доступ немедленно.</p>}
    {draft && <article className="mvp-card"><h3>{draft.id ? 'Редактирование' : 'Новая запись'} · {tabs[tab]}</h3><form className="form-grid" onSubmit={save}>
      {tab === 'users' ? <>
        {input('fullName', 'Имя', 'text', true)}{input('email', 'Email', 'email', draft.role !== 'tenant')}{input('phone', 'Телефон')}{input('password', 'Новый пароль', 'password', false, 'Оставьте пустым, чтобы сохранить пароль; новый — от 10 символов.')}
        {select('role', 'Роль', draft.role === 'tenant' ? {tenant: 'Арендатор'} : user.role === 'admin' ? {admin: 'Администратор', manager: 'Менеджер', worker: 'Исполнитель'} : {worker: 'Исполнитель'}, true)}
        {!['admin', 'tenant'].includes(draft.role) && select('propertyId', 'Объект', Object.fromEntries(overview.properties.map(p => [p.id, p.name])), true)}
        {draft.role !== 'tenant' && select('specialty', 'Специализация', specialtyNames)}{check('isActive', 'Учётная запись активна')}
      </> : <>
        {input('name', 'Название', 'text', true)}
        <label><span>Объект *</span><select required disabled={Boolean(draft.id)} value={draft.propertyId} onChange={event => setDraft({...draft, propertyId: event.target.value, unitId: '', equipmentId: '', responsibleId: ''})}>{overview.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {['equipment', 'plans', 'meters'].includes(tab) && <>{select('unitId', tab === 'meters' && draft.scope === 'common' ? 'Помещение установки (необязательно)' : 'Помещение', units, tab !== 'meters' || draft.scope === 'individual')}{select('responsibleId', 'Ответственный', workers)}</>}
        {tab === 'equipment' && <>{input('type', 'Тип оборудования', 'text', true)}{input('serialNumber', 'Инвентарный / серийный номер')}{input('cost', 'Стоимость, ₽', 'number')}{input('warrantyUntil', 'Гарантия до', 'date')}{select('status', 'Состояние', {active: 'В эксплуатации', maintenance: 'На обслуживании', retired: 'Списано'}, true)}{input('photoUrl', 'Фотография (HTTPS)')}{area('specifications', 'Технические характеристики')}
          <label><span>Загрузить фото (до 2 МБ)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setError('Фото должно быть не больше 2 МБ'); return; } const reader = new FileReader(); reader.onload = () => change('photoUrl', reader.result); reader.readAsDataURL(file); }} /></label></>}
        {tab === 'plans' && <>{select('equipmentId', 'Оборудование', Object.fromEntries(data.equipment.filter(e => e.unitId === draft.unitId && e.status !== 'retired').map(e => [e.id, e.name || ''])))}{input('nextDate', 'Следующее выполнение', 'date', true)}{input('intervalDays', 'Повторять через, дней', 'number', true)}{area('checklist', 'Чек-лист: один пункт на строку', true)}{area('instructions', 'Инструкция')}{check('active', 'Генерировать заявки автоматически')}<p className="field-hint">В указанную дату создаётся заявка с чек-листом и ответственным. Повторная проверка расписания не создаёт дубликатов.</p></>}
        {tab === 'services' && <>{check('paid', 'Платная услуга')}{input('basePrice', 'Базовая цена, ₽', 'number')}{input('hourlyRate', 'Тариф часа, ₽', 'number')}{select('specialty', 'Специализация', specialtyNames)}{area('description', 'Состав услуги и правила обработки')}{check('active', 'Доступна в каталоге')}<p className="field-hint">Стоимость работ = часы × тариф + ТМЦ. Для платных услуг к оплате добавляется базовая цена; для бесплатных ведётся только внутренний учёт затрат.</p></>}
        {tab === 'meters' && <>{select('scope', 'Назначение', {individual: 'Индивидуальный', common: 'Общедомовой / МОП'}, true)}{select('resource', 'Ресурс', resourceNames, true)}{input('serialNumber', 'Заводской номер')}{input('tariff', 'Тариф за единицу, ₽', 'number', true)}{input('initialValue', 'Начальное показание', 'number', true)}{check('active', 'Принимать показания')}<p className="field-hint">Общедомовой расход распределяется по площади и дням аренды. История хранит тариф и доли на момент ввода; изменение тарифа действует на новые показания.</p></>}
        {tab === 'news' && <>{select('audience', 'Кому показывать', {all: 'Всем', staff: 'Сотрудникам', tenants: 'Арендаторам'}, true)}{select('tone', 'Важность', {info: 'Информация', warning: 'Требует внимания', critical: 'Критично', success: 'Успешно'}, true)}{input('expiresAt', 'Показывать до', 'date')}{area('content', 'Текст объявления', true)}{check('published', 'Опубликовано')}</>}
        {tab === 'expenses' && <>{input('date', 'Дата расхода', 'date', true)}{input('amount', 'Сумма, ₽', 'number', true)}{input('category', 'Категория')}<p className="field-hint">Расход попадёт в расчёт чистого операционного дохода на дашборде. Вносите сюда все расходы, включая затраты по заявкам, один раз.</p></>}
      </>}
      <div className="mvp-actions form-wide"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setDraft(null)}>Отмена</button></div>
    </form></article>}
    {readingMeter && <article className="mvp-card"><h3>Показания · {data.meters.find(m => m.id === readingMeter)?.name}</h3><form className="form-grid" onSubmit={submitReading}><label>Месяц *<input type="month" required max={new Date().toISOString().slice(0, 7)} value={readingPeriod} onChange={e => setReadingPeriod(e.target.value)} /></label><label>Показание *<input type="number" required min="0" step="any" value={readingValue} onChange={e => setReadingValue(e.target.value)} /></label><button className="primary-button" disabled={busy}>Сохранить показание</button><button type="button" className="secondary-button" onClick={() => setReadingMeter('')}>Отмена</button></form></article>}
    <div className="operations-list">{rows.map(row => <article className="mvp-card operation-card" key={row.id}>
      <div className="mvp-card-head"><div>{row.propertyId && <small>{overview.properties.find(p => p.id === row.propertyId)?.name}</small>}<h3>{row.name || row.fullName || auditLabel(row.action)}</h3></div>{tab !== 'audit' && <button type="button" className="secondary-button" onClick={() => { setDraft({...row, password: ''}); setError(''); }}>Изменить</button>}</div>
      {tab === 'equipment' && <><div className="operation-meta">{row.photoUrl && <img src={row.photoUrl} alt={row.name} className="equipment-photo" loading="lazy" />}<div><p>{row.type} · {row.serialNumber || 'Без номера'} · {statusNames[row.status]}</p><button type="button" className="text-button" onClick={() => onUnit(row.unitId)}>Помещение {unitName(row.unitId)}</button><p>Гарантия до {date(row.warrantyUntil)} · {currency(row.cost)}</p><p>Ответственный: {data.users.find(u => u.id === row.responsibleId)?.fullName || 'Не назначен'}</p><p className="preserve-lines">{row.specifications}</p></div></div><details><summary>История ремонтов и ППР ({tickets.filter(t => t.equipmentId === row.id).length})</summary>{tickets.filter(t => t.equipmentId === row.id).map(t => <button type="button" key={t.id} className="mvp-list-button" onClick={() => onTicket(t.id)}>{t.number} · {t.title} · {statusNames[t.status]}</button>)}{data.plans.filter(p => p.equipmentId === row.id).map(p => <p key={p.id}>ППР: {p.name} · {date(p.nextDate)}</p>)}</details></>}
      {tab === 'plans' && <><p><span className={`status-pill status-pill--${row.active ? 'info' : 'warning'}`}>{row.active ? 'По расписанию' : 'Приостановлено'}</span> · Следующая дата: {date(row.nextDate)} · каждые {row.intervalDays} дн.</p><button type="button" className="text-button" onClick={() => onUnit(row.unitId)}>Помещение {unitName(row.unitId)}</button><p>Ответственный: {data.users.find(u => u.id === row.responsibleId)?.fullName || 'Не назначен'}</p><ol>{row.checklist?.map((line: string, i: number) => <li key={i}>{line}</li>)}</ol><details><summary>Задания и история выполнения ({tickets.filter(t => t.maintenancePlanId === row.id).length})</summary>{tickets.filter(t => t.maintenancePlanId === row.id).map(t => <button type="button" className="mvp-list-button" key={t.id} onClick={() => onTicket(t.id)}>{t.title} · {statusNames[t.status]}</button>)}</details></>}
      {tab === 'services' && <><span className="status-pill">{row.paid ? 'Платная' : 'Бесплатная'} · {row.active ? 'Доступна' : 'Архив'}</span><p>{row.paid ? `Базовая цена ${currency(row.basePrice)} · ` : ''}Тариф работ: {currency(row.hourlyRate)} / ч</p><p>{specialtyNames[row.specialty]}</p><p className="preserve-lines">{row.description}</p></>}
      {tab === 'meters' && <><p>{resourceNames[row.resource]} · {row.scope === 'common' ? 'Общедомовой / МОП' : `Помещение ${unitName(row.unitId)}`} · № {row.serialNumber || '—'}</p><p>Тариф {currency(row.tariff)} · Ответственный: {data.users.find(u => u.id === row.responsibleId)?.fullName || 'Не назначен'}</p><button type="button" className="secondary-button" disabled={!row.active} onClick={() => { setReadingMeter(row.id); setReadingValue(''); }}>Внести показания</button><details><summary>История и распределение</summary>{data.readings.filter(r => r.meterId === row.id).sort((a,b) => b.period.localeCompare(a.period)).map(r => <div className="reading-row" key={r.id}><strong>{r.period}: {r.previous} → {r.value} · расход {r.consumption} · {currency(r.amount)}</strong><p>Тариф на момент ввода: {currency(r.tariff)}</p>{r.allocations.map((a: Row, i: number) => <p key={i}>{overview.tenants?.find(t => t.id === a.tenantId)?.name || 'Арендатор'} · {unitName(a.unitId)} · {currency(a.amount)} ({(a.share * 100).toFixed(1)}%)</p>)}{r.unallocated > 0 && <p>Не распределено: {currency(r.unallocated)} — нет действующих договоров.</p>}</div>)}</details><small className="field-hint">Распределение для проверки. Начисления в счета переносятся менеджером после сверки.</small></>}
      {tab === 'news' && <><span className={`status-pill status-pill--${row.tone}`}>{row.published ? 'Опубликовано' : 'Черновик'} · {row.audience === 'all' ? 'Всем' : row.audience === 'staff' ? 'Сотрудникам' : 'Арендаторам'}</span><p className="preserve-lines">{row.content}</p><small>{date(row.createdAt)}{row.expiresAt ? ` · до ${date(row.expiresAt)}` : ''}</small></>}
      {tab === 'expenses' && <p>{date(row.date)} · {row.category} · <strong>{currency(row.amount)}</strong></p>}
      {tab === 'users' && <><p>{row.email || 'Без email'} · {row.phone || 'Без телефона'}</p><p>{roleNames[row.role]}{row.specialty ? ` · ${specialtyNames[row.specialty]}` : ''} · {row.isActive ? 'Активен' : 'Заблокирован'}</p><small>Последний вход: {date(row.lastLoginAt)}</small>{row.phone && row.isActive && <BotLinkPanel token={token} userId={row.id} />}</>}
      {tab === 'audit' && <><p>{row.actorName} · {new Date(row.createdAt).toLocaleString('ru-RU')}</p><small>{row.entityType} · {row.entityId}</small><details><summary>Изменения</summary><pre className="audit-values">{JSON.stringify(row.changes, null, 2)}</pre></details></>}
    </article>)}</div>
    {!rows.length && <div className="mvp-card empty-state">{tab === 'audit' ? 'Изменений пока нет.' : 'Записей пока нет. Добавьте первую запись или измените фильтр.'}</div>}
  </section>;
}
function auditLabel(action: string) { return ({user_updated: 'Изменён пользователь', user_created: 'Создан пользователь', created: 'Добавлена запись', updated: 'Изменена запись', reading_added: 'Внесено показание', work_logged: 'Учтены работы'} as Record<string,string>)[action] || action; }

type TicketProps = { token: string; ticket: Ticket; overview: Overview; operations: OperationsData | null; onRefresh: () => Promise<unknown>; onUnit: (id: string) => void; onTenant: (id: string) => void; onTicket: (id: string) => void; tickets: Ticket[]; readOnly?: boolean; canEditLinks?: boolean };
export function TicketOperations({ token, ticket, overview, operations, onRefresh, onUnit, onTenant, onTicket, tickets, readOnly, canEditLinks = true }: TicketProps) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [work, setWork] = useState({description: '', hours: '', materialCost: ''});
  const equipment = operations?.equipment.filter(e => e.unitId === ticket.unitId) || [];
  const unit = overview.units.find(u => u.id === ticket.unitId);
  const leases = overview.leases?.filter(l => l.unitId === ticket.unitId) || [];
  const currentLease = leases.find(l => l.id === ticket.leaseId) || leases.find(l => ['signed','active','prolongation'].includes(l.stage));
  const services = operations?.services.filter(s => s.propertyId === unit?.propertyId && (s.active || s.id === ticket.serviceId)) || [];
  const service = services.find(s => s.id === ticket.serviceId);
  const logs = ticket.workLogs || [];
  const cost = logs.reduce((sum, row) => sum + row.cost, 0);
  const changeLink = async (key: string, value: string) => { setBusy(true); setError(''); try { await request(`/api/tickets/${ticket.id}`, token, 'PUT', {[key]: value || null}); await onRefresh(); } catch (error) { setError((error as Error).message); } finally {setBusy(false);} };
  return <div className="ticket-context">
    <h4>Связанные данные</h4><div className="mvp-actions"><button type="button" className="text-button" onClick={() => onUnit(ticket.unitId)}>Помещение {unit?.number || '—'}</button>{currentLease && <button type="button" className="text-button" onClick={() => onTenant(currentLease.tenantId)}>Арендатор · договор {currentLease.contractNumber}</button>}</div>
    {unit?.photoUrl && <img src={unit.photoUrl} alt={`Помещение ${unit.number}`} className="equipment-photo" />}
    {!readOnly && canEditLinks && <div className="form-grid"><label>Оборудование<select disabled={busy} value={ticket.equipmentId || ''} onChange={e => void changeLink('equipmentId', e.target.value)}><option value="">Не привязано</option>{equipment.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Услуга<select disabled={busy} value={ticket.serviceId || ''} onChange={e => void changeLink('serviceId', e.target.value)}><option value="">Не выбрана</option>{services.map(row => <option key={row.id} value={row.id}>{row.name} · {row.paid ? 'платная' : 'бесплатная'}</option>)}</select></label><label>Договор<select disabled={busy} value={ticket.leaseId || ''} onChange={e => void changeLink('leaseId', e.target.value)}><option value="">Не привязан</option>{leases.map(row => <option key={row.id} value={row.id}>{row.contractNumber}</option>)}</select></label></div>}
    {error && <p role="alert" className="ops-error">{error}</p>}
    <details><summary>Предыдущие обращения по помещению ({tickets.filter(t => t.unitId === ticket.unitId && t.id !== ticket.id).length})</summary>{tickets.filter(t => t.unitId === ticket.unitId && t.id !== ticket.id).map(t => <button type="button" className="mvp-list-button" key={t.id} onClick={() => onTicket(t.id)}>{t.number} · {t.title} · {statusNames[t.status]}</button>)}</details>
    <details><summary>Работы и ТМЦ · затраты {currency(cost)}{service?.paid ? ` · к оплате ${currency(cost + service.basePrice)}` : ' · без оплаты арендатором'}</summary>{logs.map(log => <p key={log.id}>{log.description} · {log.hours} ч · ТМЦ {currency(log.materialCost)} · всего {currency(log.cost)} · {log.createdByName}</p>)}
      {!readOnly && isOpenTicket(ticket.status) && <form className="form-grid" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await request(`/api/operations/tickets/${ticket.id}/work`, token, 'POST', { description: work.description, hours: Number(work.hours || 0), materialCost: Number(work.materialCost || 0) }); setWork({description:'',hours:'',materialCost:''}); await onRefresh(); } catch(error) {setError((error as Error).message);} finally {setBusy(false);} }}><label>Работа / использованные материалы *<input required value={work.description} onChange={e => setWork({...work, description:e.target.value})} /></label><label>Трудозатраты, ч<input type="number" min="0" max="744" step="0.25" value={work.hours} onChange={e => setWork({...work,hours:e.target.value})} /></label><label>Стоимость ТМЦ, ₽<input type="number" min="0" step="0.01" value={work.materialCost} onChange={e => setWork({...work,materialCost:e.target.value})} /></label><button disabled={busy} className="secondary-button">Добавить работу</button><small className="field-hint">Тариф фиксируется в момент добавления работы. Счёт на оплату оформляется после согласования.</small></form>}
    </details>
  </div>;
}

export function TenantServices({ data }: { data: OperationsData | null }) {
  if (!data) return null;
  return <article className="surface"><h3>Объявления и услуги</h3>{data.news.filter(n => n.published).map(n => <article className={`notification-card notification-card--${n.tone}`} key={n.id}><h4>{n.name}</h4><p className="preserve-lines">{n.content}</p><small>{date(n.createdAt)}</small></article>)}<div className="operations-list">{data.services.filter(s => s.active).map(s => <article key={s.id}><h4>{s.name}</h4><p>{s.description}</p><small>{s.paid ? `От ${currency(s.basePrice)} · ${currency(s.hourlyRate)} / ч` : 'Бесплатно'}</small></article>)}</div>{!data.news.length && !data.services.length && <p>Объявления и услуги появятся здесь после публикации управляющей компанией.</p>}</article>;
}

export function UnitStructure({ token, properties, units, tickets, equipment, onUnit }: { token: string; properties: {id: string;name: string}[]; units: Unit[]; tickets: Ticket[]; equipment: Row[]; onUnit: (id: string) => void }) {
  const [tenant, setTenant] = useState(''); const [mode, setMode] = useState('tree');
  const [plans, setPlans] = useState<Row[]>([]); const [planId, setPlanId] = useState('');
  const [placing, setPlacing] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; request<OperationsData>('/api/operations', token).then(d => {if(active) setPlans(d.floorplans || []);}).catch(e => {if(active) setError(e.message);}); return () => {active=false;}; }, [token]);
  const visible = units.filter(u => !tenant || u.tenantName === tenant);
  const groups = new Map<string, Unit[]>();
  visible.forEach(u => {const key = `${properties.find(p => p.id === u.propertyId)?.name} → ${u.building || 'Основной корпус'} → ${u.entrance || 'Общая секция'} → Этаж ${u.floor}`; groups.set(key, [...(groups.get(key) || []), u]);});
  const visiblePlans = plans.filter(p => units.some(u => u.propertyId === p.propertyId));
  const plan = visiblePlans.find(p => p.id === planId) || visiblePlans[0];
  const caption = (unit: Unit) => `${unit.number} · ${unit.area} м² · ${unit.tenantName || (unit.status === 'maintenance' ? 'Обслуживание' : 'Свободно')} · оборудование: ${equipment.filter(e => e.unitId === unit.id).length} · заявки: ${tickets.filter(t => t.unitId === unit.id && isOpenTicket(t.status)).length}`;
  return <article className="mvp-card unit-structure"><div className="mvp-card-head"><div><h3>Структура объекта</h3><p>Объект → корпус → подъезд → этаж → помещение</p></div><div className="mvp-actions"><select aria-label="Фильтр по арендатору" value={tenant} onChange={e => setTenant(e.target.value)}><option value="">Все арендаторы</option>{[...new Set(units.map(u => u.tenantName).filter(Boolean))].map(name => <option key={name} value={name!}>{name}</option>)}</select><button className="secondary-button" type="button" onClick={() => setMode(mode === 'tree' ? 'plan' : 'tree')}>{mode === 'tree' ? 'Планы объекта' : 'Дерево помещений'}</button></div></div>
    {error && <p role="alert" className="ops-error">{error}</p>}
    {mode === 'tree' ? [...groups].sort(([a],[b]) => a.localeCompare(b, 'ru', {numeric:true})).map(([name, rows]) => <details key={name} open><summary>{name} · {rows.length}</summary><div className="unit-map-grid">{rows.map(u => <button type="button" key={u.id} className={`unit-map-cell unit-map-cell--${u.status}`} onClick={() => onUnit(u.id)} title={caption(u)}><strong>{u.number}</strong><span>{u.area} м² · {u.tenantName || (u.status === 'maintenance' ? 'Обслуживание' : 'Свободно')}</span><small>{equipment.filter(e => e.unitId === u.id).length} оборудования · {tickets.filter(t => t.unitId === u.id && isOpenTicket(t.status)).length} заявок</small></button>)}</div></details>) : <>
      <p className="field-hint">Загрузите генеральный или поэтажный план, затем выберите помещение и укажите его положение на изображении. Карточки помещений открываются по меткам.</p>
      <div className="mvp-actions"><select aria-label="План" value={plan?.id || ''} onChange={e => {setPlanId(e.target.value);setPlacing('');}}>{visiblePlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><label className="secondary-button">Загрузить план (PNG / JPEG, до 2 МБ)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !units.length} onChange={e => {const file = e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>2*1024*1024){setError('План должен быть не больше 2 МБ');return;}const reader=new FileReader();reader.onload=async()=>{setBusy(true);setError('');try{const result=await request<{item:Row}>('/api/operations/floorplans',token,'POST',{name:file.name,propertyId:units[0].propertyId,image:reader.result,markers:[]});setPlans(p=>[...p,result.item]);setPlanId(result.item.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};reader.readAsDataURL(file);}} /></label>{plan && <select aria-label="Разместить помещение" value={placing} onChange={e => setPlacing(e.target.value)}><option value="">Разместить / переместить помещение</option>{units.filter(u=>u.propertyId===plan.propertyId).map(u=><option key={u.id} value={u.id}>{u.building} · {u.floor} этаж · {u.number}</option>)}</select>}</div>
      {plan ? <div className={`floor-plan ${placing ? 'floor-plan--placing' : ''}`} onClick={async e => {if(!placing||busy)return;const rect=e.currentTarget.getBoundingClientRect();const markers=[...(plan.markers||[]).filter((m:Row)=>m.unitId!==placing),{unitId:placing,x:(e.clientX-rect.left)/rect.width*100,y:(e.clientY-rect.top)/rect.height*100}];setBusy(true);try{const result=await request<{item:Row}>(`/api/operations/floorplans/${plan.id}`,token,'PUT',{markers,updatedAt:plan.updatedAt});setPlans(rows=>rows.map(p=>p.id===plan.id?result.item:p));setPlacing('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><img alt={plan.name} src={plan.image} />{(plan.markers||[]).map((marker:Row)=>{const unit=visible.find(u=>u.id===marker.unitId);return unit?<button key={unit.id} type="button" className={`plan-marker unit-map-cell--${unit.status}`} style={{left:`clamp(40px, ${marker.x}%, calc(100% - 40px))`,top:`clamp(16px, ${marker.y}%, calc(100% - 16px))`}} title={caption(unit)} onClick={e=>{e.stopPropagation();if(!placing)onUnit(unit.id);}}>{unit.number}</button>:null;})}</div> : <div className="empty-state">Планы ещё не загружены. Дерево помещений доступно в соседнем режиме.</div>}
    </>}
  </article>;
}

export function WorkerMeters({token, userId}: {token: string; userId: string}) {
  const [data, setData] = useState<OperationsData>(emptyData);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => setData(await request<OperationsData>('/api/operations', token));
  useEffect(() => { let active = true; request<OperationsData>('/api/operations', token).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [token]);
  const meters = data.meters.filter(m => m.active && m.responsibleId === userId);
  const submit = async (event: FormEvent<HTMLFormElement>, meterId: string) => {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const body = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try { await request(`/api/operations/meters/${meterId}/readings`, token, 'POST', {period: body.get('period'), value: Number(body.get('value'))}); await load(); form.reset(); setNotice('Показание сохранено'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (!meters.length && !error) return null;
  return <article className="surface worker-meters"><h3>Мои счётчики</h3>{error && <p role="alert" className="notice notice--error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}{meters.map(m => {
    const readings = data.readings.filter(r => r.meterId === m.id).sort((a,b) => b.period.localeCompare(a.period));
    return <details key={m.id}><summary>{m.name} · {resourceNames[m.resource]}</summary><p>Предыдущее показание: {readings[0]?.value ?? m.initialValue}</p><form className="form-grid" onSubmit={event => submit(event, m.id)}><label>Месяц *<input name="period" type="month" required defaultValue={new Date().toISOString().slice(0,7)} max={new Date().toISOString().slice(0,7)} /></label><label>Показание *<input name="value" type="number" step="any" min={readings[0]?.value ?? m.initialValue} required /></label><button type="submit" className="primary-button" disabled={busy}>Сохранить показание</button></form><details><summary>История показаний</summary>{readings.map(r => <p key={r.id}>{r.period}: {r.previous} → {r.value} · расход {r.consumption}</p>)}</details></details>;
  })}</article>;
}
