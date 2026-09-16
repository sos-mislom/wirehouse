import crypto from 'node:crypto';

const key = phone => String(phone || '').replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
export function verifiedTelegramPhone(message) {
  if (message?.chat?.type !== 'private' || !message.from?.id || String(message.chat.id) !== String(message.from.id)) return '';
  if (!message.contact?.user_id || String(message.contact.user_id) !== String(message.from.id)) return '';
  const phone = key(message.contact.phone_number);
  return /^\d{10,15}$/.test(phone) ? `+${phone}` : '';
}
export function issueBotLink(db, actor, userId, channel, now = Date.now()) {
  if (!['telegram', 'vk'].includes(channel)) throw fail('Выберите Telegram или VK');
  const user = db.getUserById(userId || actor.id);
  if (!user?.is_active || !key(user.phone)) throw fail('У пользователя должен быть указан телефон');
  if (actor.id !== user.id && actor.role !== 'admin' && !(actor.role === 'manager' && user.role === 'worker' && actor.property_id && actor.property_id === user.property_id)) throw fail('Нет доступа к пользователю', 403);
  const code = crypto.randomBytes(12).toString('hex').toUpperCase();
  const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
  db.transaction(() => {
    db.data.bot_link_codes = db.data.bot_link_codes.filter(c => Date.parse(c.expiresAt) > now && !(c.userId === user.id && c.channel === channel));
    db.data.bot_link_codes.push({hash:digest(code), userId:user.id, phone:key(user.phone), channel, expiresAt});
    db.audit(actor, 'bot_link_issued', 'user', user.id, {channel, expiresAt});
  });
  return {code, command:`/link ${code}`, channel, expiresAt};
}
export function bindBotUser(db, user, channel, recipientId, displayName = '') {
  if (!user?.is_active || !recipientId) throw fail('Учётная запись недоступна');
  const other = db.getOtpBindingByRecipient(channel, recipientId);
  if (other && other.user_id !== user.id) throw fail('Этот аккаунт мессенджера уже подключён к другому пользователю');
  return db.transaction(() => {
    const binding = db.upsertOtpBinding({channel, phone:user.phone, userId:user.id, tenantId:user.tenant_id, recipientId, displayName});
    db.audit(user, 'bot_linked', 'user', user.id, {channel});
    return binding;
  });
}
export function consumeBotLink(db, channel, recipientId, text, displayName = '', now = Date.now()) {
  const code = String(text || '').trim().match(/^\/link\s+([A-Fa-f0-9]{24})$/)?.[1].toUpperCase();
  if (!code) throw fail('Отправьте /link и код, полученный в кабинете');
  return db.transaction(() => {
    const entry = db.data.bot_link_codes.find(c => c.hash === digest(code) && c.channel === channel && Date.parse(c.expiresAt) > now);
    if (!entry) throw fail('Код недействителен или истёк. Получите новый код в кабинете');
    const user = db.getUserById(entry.userId);
    if (!user?.is_active || key(user.phone) !== entry.phone) throw fail('Доступ или телефон изменился. Получите новый код');
    const binding = bindBotUser(db, user, channel, recipientId, displayName);
    db.data.bot_link_codes = db.data.bot_link_codes.filter(c => c !== entry);
    return binding;
  });
}
