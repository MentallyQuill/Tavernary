export type EnrichmentBatchCheckpoint = {
  status: string;
  progress: string;
  checkpointCommit: string | null;
};

export type EnrichmentRolloutOperations = {
  syncMain(): Promise<void>;
  preflight(): Promise<void>;
  plan(): Promise<{ action: string }>;
  startCanary(): Promise<void>;
  publishCanaryBatch(): Promise<EnrichmentBatchCheckpoint>;
  canaryCheckpointCommit(): Promise<string | null>;
  fullCheckpointCommit(): Promise<string | null>;
  waitForDeployment(commit: string): Promise<number>;
  approveCanary(commit: string, runId: number): Promise<void>;
  recordFullDeployment(commit: string, runId: number): Promise<void>;
  authorizeFull(): Promise<void>;
  prepareFull(): Promise<void>;
  startFull(): Promise<EnrichmentBatchCheckpoint>;
  resumeFull(): Promise<EnrichmentBatchCheckpoint>;
};

export function runEnrichmentRollout(
  operations: EnrichmentRolloutOperations,
): Promise<{ status: "complete" | "complete-with-errors" }>;

export function runMain(options?: {
  operations?: EnrichmentRolloutOperations;
  runnerTemp?: string;
  writeText?: (path: string, content: string) => Promise<void>;
}): Promise<{ status: "complete" | "complete-with-errors" }>;

export function executeCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    silent?: boolean;
  },
): Promise<{ stdout: string; exitCode: number }>;

export function requiresFullCheck(stagedFiles: string[]): boolean;

export function createGitPublisher(options: {
  npmCommand: string;
  runCommand: typeof executeCommand;
}): (input: { paths: string[]; message: string }) => Promise<{
  changed: boolean;
  publishedCommit: string | null;
  registryCommit: string | null;
}>;

export function createProductionOperations(options?: {
  npmCommand?: string;
  batchSize?: number;
  concurrency?: number;
  timeoutSeconds?: number;
  selectionMode?: "pending" | "all-automatic";
  runCommand?: typeof executeCommand;
  readJson?: (path: string) => Promise<Record<string, any>>;
  runnerTemp?: string;
  writeText?: (path: string, content: string) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  publishChanges?: (input: { paths: string[]; message: string }) => Promise<{
    changed: boolean;
    publishedCommit: string | null;
    registryCommit: string | null;
  }>;
}): EnrichmentRolloutOperations;
