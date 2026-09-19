import { PageBoundary } from "./app/PageBoundary";
import { WorkspaceProvider } from "./app/WorkspaceContext";
import { WorkspaceRouter } from "./app/WorkspaceRouter";
export default function App() {
  return (
    <PageBoundary>
      <WorkspaceProvider>
        <WorkspaceRouter />
      </WorkspaceProvider>
    </PageBoundary>
  );
}
