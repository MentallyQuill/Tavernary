import type {
  ApiActivityInspection,
  ContributorCollection,
  ContributorContext,
  ObservationRun,
  ProviderActivityInput,
  ProviderRepositoryRecord,
  RepositoryObservation,
  RepositoryProvider,
} from "./repository-provider.mjs";
import type { RepositorySourceIdentity } from "../submissions/source-identity.mjs";

export interface CodebergRepositoryProviderClients {
  request?: (path: string) => Promise<{
    data: any;
    status?: number;
    rateLimit?: { remaining?: number | null } | null;
  }>;
  inspectApiActivity?: (
    input: ProviderActivityInput,
    options: Record<string, unknown>,
  ) => Promise<ApiActivityInspection>;
}

export class CodebergRepositoryProvider implements RepositoryProvider {
  readonly name: "codeberg";
  readonly snapshotDirectory: "data/snapshots/codeberg";
  constructor(clients?: CodebergRepositoryProviderClients);
  resolve(
    identity: RepositorySourceIdentity,
  ): Promise<RepositorySourceIdentity>;
  observe(records: ProviderRepositoryRecord[]): Promise<ObservationRun>;
  inspectActivity(input: ProviderActivityInput): Promise<ApiActivityInspection>;
  collectContributors(
    repository: RepositoryObservation["repository"],
    context: ContributorContext,
  ): Promise<ContributorCollection>;
  readRootReadme: RepositoryProvider["readRootReadme"];
}
