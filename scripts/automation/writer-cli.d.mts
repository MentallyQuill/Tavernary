export type AutomationWriterMode =
  | "reconcile"
  | "reconcile-project"
  | "publish"
  | "prepare"
  | "confirm"
  | "confirm-restore"
  | "retain"
  | "backfill-identities"
  | "verify-publisher"
  | "finalize"
  | "advisory-notice";
export function runAutomationWriterCli(options?: {
  env?: Record<string, string | undefined>;
  event?: { inputs?: Record<string, string> };
  handlers?: Partial<
    Record<
      AutomationWriterMode,
      (inputs: Record<string, string>) => Promise<unknown>
    >
  >;
  write?: (text: string) => void;
}): Promise<number>;
