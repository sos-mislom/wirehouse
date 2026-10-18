import { RealtimeProvider } from "./realtime/RealtimeContext";
import { PageBoundary } from "./app/PageBoundary";
import { WorkspaceProvider } from "./app/WorkspaceContext";
import { WorkspaceRouter } from "./app/WorkspaceRouter";
export default function App() {
  return (
    <PageBoundary>
      <RealtimeProvider>
        <WorkspaceProvider>
          <WorkspaceRouter />
        </WorkspaceProvider>
      </RealtimeProvider>
    </PageBoundary>
  );
}
