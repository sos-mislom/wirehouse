import { createFinanceQueries } from "./queries/finance.js";
import { createTenantQueries } from "./queries/tenant.js";
import { createWorkspaceQueries } from "./queries/workspace.js";

export function createQueriesService(deps) {
  // Pass forward-referencing functions between sub-query services
  let financeQueries;
  let workspaceQueries;
  let tenantQueries;

  const getBuildScopedCollections = (user) => workspaceQueries.buildScopedCollections(user);
  const getGetScopedTickets = (user) => workspaceQueries.getScopedTickets(user);
  const getBuildFinanceSummary = (scoped, scopedTickets) =>
    financeQueries.buildFinanceSummary(scoped, scopedTickets);

  financeQueries = createFinanceQueries({
    ...deps,
    buildScopedCollections: getBuildScopedCollections,
  });

  workspaceQueries = createWorkspaceQueries({
    ...deps,
    buildFinanceSummary: getBuildFinanceSummary,
  });

  tenantQueries = createTenantQueries({
    ...deps,
    buildScopedCollections: getBuildScopedCollections,
    getScopedTickets: getGetScopedTickets,
  });

  return {
    ...workspaceQueries,
    ...financeQueries,
    ...tenantQueries,
  };
}
