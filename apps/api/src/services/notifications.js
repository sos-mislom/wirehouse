import { config } from "../config.js";
export function createNotificationsService({ db, sendEmail }) {
  const getNotificationRecipientUsers = ({
    propertyId = null,
    tenantId = null,
    includeTenant = false,
  } = {}) => {
    const users = db.listUsers().filter((user) => user.is_active === 1);
    return users.filter((user) => {
      if (user.role === "admin") return true;
      if (user.role === "manager")
        return Boolean(user.property_id && user.property_id === propertyId);
      if (user.role === "worker") {
        return Boolean(user.property_id && user.property_id === propertyId);
      }
      if (includeTenant && user.role === "tenant") {
        return tenantId && user.tenant_id === tenantId;
      }
      return false;
    });
  };

  const getNotificationEmailForUser = (user, tenantId = null) => {
    if (user.email) {
      return user.email;
    }
    if (user.role === "tenant" && tenantId) {
      return db.getTenant(tenantId)?.email ?? null;
    }
    return null;
  };

  const dispatchNotification = async ({
    type,
    title,
    message,
    tone = "info",
    entityType = null,
    entityId = null,
    propertyId = null,
    tenantId = null,
    recipients = [],
    createdBy = null,
    channels = config.notificationChannels,
  }) => {
    const uniqueRecipients = [
      ...new Map(recipients.map((user) => [user.id, user])).values(),
    ];
    const deliveryRows = [];
    for (const recipient of uniqueRecipients) {
      if (channels.includes("in_app")) {
        deliveryRows.push({
          channel: "in_app",
          userId: recipient.id,
          status: "delivered",
        });
      }
      if (channels.includes("email")) {
        deliveryRows.push({
          channel: "email",
          userId: recipient.id,
          email: getNotificationEmailForUser(recipient, tenantId),
          status: config.smtpHost ? "pending" : "skipped",
          error: config.smtpHost ? null : "SMTP is not configured",
        });
      }
    }

    const created = db.createNotification({
      type,
      title,
      message,
      tone,
      entityType,
      entityId,
      propertyId,
      tenantId,
      createdBy,
      deliveries: deliveryRows,
    });

    await Promise.all(
      created.deliveries
        .filter(
          (delivery) =>
            delivery.channel === "email" &&
            delivery.status === "pending" &&
            delivery.recipient_email,
        )
        .map(async (delivery) => {
          try {
            const result = await sendEmail({
              to: delivery.recipient_email,
              subject: title,
              text: message,
            });
            db.updateNotificationDelivery(delivery.id, {
              status: "delivered",
              attempts: Number(delivery.attempts ?? 0) + 1,
              externalMessageId: result.messageId,
            });
          } catch (error) {
            db.updateNotificationDelivery(delivery.id, {
              status: "failed",
              attempts: Number(delivery.attempts ?? 0) + 1,
              error:
                error instanceof Error
                  ? error.message
                  : "Email delivery failed",
            });
          }
        }),
    );

    return created;
  };

  const notifyTicketEvent = async ({
    ticket,
    type,
    title,
    message,
    tone = "info",
    actor = null,
    includeTenant = true,
  }) =>
    dispatchNotification({
      type,
      title,
      message,
      tone,
      entityType: "ticket",
      entityId: ticket.id,
      propertyId: ticket.propertyId ?? ticket.property_id,
      tenantId: ticket.tenantId ?? ticket.tenant_id,
      createdBy: actor?.id ?? null,
      recipients: getNotificationRecipientUsers({
        propertyId: ticket.propertyId ?? ticket.property_id,
        tenantId: ticket.tenantId ?? ticket.tenant_id,
        includeTenant,
      }),
    });
  return {
    getNotificationRecipientUsers,
    getNotificationEmailForUser,
    dispatchNotification,
    notifyTicketEvent,
  };
}
