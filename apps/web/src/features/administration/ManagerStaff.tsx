import { Operations } from "../../Operations";
import { useWorkspace } from "../../app/WorkspaceContext";
export function ManagerStaff() {
  const {
    session,
    overview,
    tickets,
    refreshWorkspace,
    openUnitDetail,
    openTicketDetail,
    setManagerScreen,
  } = useWorkspace();
  return (
    <Operations
      token={session.token}
      user={session.user}
      overview={overview}
      tickets={tickets}
      onRefresh={refreshWorkspace}
      onUnit={openUnitDetail}
      onTicket={openTicketDetail}
      initialTab="users"
      onCreateUser={() => setManagerScreen("staff-add")}
    />
  );
}
