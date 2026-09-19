import { useWorkspace } from "../../../app/WorkspaceContext";
import { ResponsiveTable } from "../../../ResponsiveTable";
import { formatDate } from "../../../shared/format";

export function TenantTicketsTab() {
  const { tenantDetail, t, openTicketDetail, locale } = useWorkspace();

  if (!tenantDetail) return null;

  return (
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
  );
}
