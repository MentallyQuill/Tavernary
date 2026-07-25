export type BaselineQueueDecision = {
  status: "continue" | "complete" | "stalled";
  continueQueue: boolean;
  before: number;
  remaining: number;
  completed: number;
};

export type BaselineQueueEnvironment = {
  GITHUB_OUTPUT?: string;
  GITHUB_STEP_SUMMARY?: string;
};

export declare function provisionalCount(manifest: unknown): number;
export declare function readProvisionalCount(path: string): Promise<number>;
export declare function baselineQueueDecision(input: {
  before: number;
  remaining: number;
}): BaselineQueueDecision;
export declare function runBaselineQueueCli(
  arguments_: string[],
  environment?: BaselineQueueEnvironment,
): Promise<number>;
