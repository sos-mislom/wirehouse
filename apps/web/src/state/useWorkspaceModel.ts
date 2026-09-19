import { useAuthActions } from "./actions/auth";
import { useBillingActions } from "./actions/billing";
import { useDataActions } from "./actions/data";
import { useDocumentsActions } from "./actions/documents";
import { useFilesActions } from "./actions/files";
import { useImportsActions } from "./actions/imports";
import { useNavigationActions } from "./actions/navigation";
import { usePortfolioActions } from "./actions/portfolio";
import { useTenantNotesActions } from "./actions/tenant-notes";
import { useTicketsActions } from "./actions/tickets";
import { useWorkspaceEffects } from "./useWorkspaceEffects";
import { useWorkspaceState } from "./useWorkspaceState";
import { useWorkspaceView } from "./useWorkspaceView";
export function useWorkspaceModel() {
  const state = useWorkspaceState();
  const view = useWorkspaceView(state);
  const base = { ...state, ...view };
  const data = useDataActions({ ...base });
  const navigation = useNavigationActions({ ...base, ...data });
  const portfolio = usePortfolioActions({ ...base, ...data, ...navigation });
  const auth = useAuthActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
  });
  const files = useFilesActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
  });
  const tickets = useTicketsActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
  });
  const documents = useDocumentsActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
    ...tickets,
  });
  const imports = useImportsActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
    ...tickets,
    ...documents,
  });
  const billing = useBillingActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
    ...tickets,
    ...documents,
    ...imports,
  });
  const tenantNotes = useTenantNotesActions({
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
    ...tickets,
    ...documents,
    ...imports,
    ...billing,
  });
  const model = {
    ...base,
    ...data,
    ...navigation,
    ...portfolio,
    ...auth,
    ...files,
    ...tickets,
    ...documents,
    ...imports,
    ...billing,
    ...tenantNotes,
  };
  useWorkspaceEffects(model);
  return model;
}
export type WorkspaceModel = ReturnType<typeof useWorkspaceModel>;
