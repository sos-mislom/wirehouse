import { createContext, useContext, type ReactNode } from "react";
import {
  useWorkspaceModel,
  type WorkspaceModel,
} from "../state/useWorkspaceModel";
const Context = createContext<WorkspaceModel | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const model = useWorkspaceModel();
  return <Context.Provider value={model}>{children}</Context.Provider>;
}
export function useWorkspaceContext() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
export function useWorkspace() {
  const value = useWorkspaceContext();
  if (!value.session || !value.overview)
    throw new Error("Authenticated workspace is required");
  return { ...value, session: value.session, overview: value.overview };
}
