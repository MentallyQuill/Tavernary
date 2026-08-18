import type {
  ApiActivityInspection,
  ContributorCollection,
  ContributorContext,
  ObservationRun,
  ProviderActivityInput,
  RepositorySourceRecord,
  RepositoryObservation,
  RepositoryProvider,
} from "./repository-provider.mjs";
import type { RepositorySourceIdentity } from "../submissions/source-identity.mjs";

export interface GitHubRepositoryProviderClients {
  token?: string;
  fetchImpl?: typeof fetch;
  observeRepositories?: (
    records: RepositorySourceRecord[],
    options: { token: string; fetchImpl: typeof fetch },
  ) => Promise<unknown>;
  inspectApiActivity?: (
    input: ProviderActivityInput,
    options: { token: string; fetchImpl: typeof fetch },
  ) => Promise<ApiActivityInspection>;
  fetchRepositoryContributors?: (
    repository: RepositoryObservation["repository"],
    options: { token: string; fetchImpl: typeof fetch },
  ) => Promise<{
    accounts: Array<{ login: string; type: string }>;
    requestCount: number;
  }>;
  fetchForkContributors?: (
    repository: RepositoryObservation["repository"],
    options: Record<string, unknown>,
  ) => Promise<Omit<ContributorCollection, "method">>;
  resolveRepository?: (identity: RepositorySourceIdentity) => Promise<{
    id: number;
    owner: string | { login: string };
    name: string;
  } | null>;
  readRootReadme?: RepositoryProvider["readRootReadme"];
  readRootFile?: RepositoryProvider["readRootFile"];
}

export class GitHubRepositoryProvider implements RepositoryProvider {
  readonly name: "github";
  readonly snapshotDirectory: "data/snapshots/github";
  constructor(clients?: GitHubRepositoryProviderClients);
  resolve(
    identity: RepositorySourceIdentity,
  ): Promise<RepositorySourceIdentity>;
  observe(records: RepositorySourceRecord[]): Promise<ObservationRun>;
  inspectActivity(input: ProviderActivityInput): Promise<ApiActivityInspection>;
  collectContributors(
    repository: RepositoryObservation["repository"],
    context: ContributorContext,
  ): Promise<ContributorCollection>;
  readRootReadme: RepositoryProvider["readRootReadme"];
  readRootFile: RepositoryProvider["readRootFile"];
}
