import type { AutomationInventoryState } from "./inventory.mjs";
import type { prepareCatalogOperation } from "./catalog-preparation.mjs";
export function runCatalogPreparationCli(options?: {
  env?: Record<string, string | undefined>;
  event?: { inputs?: Record<string, string> };
  outputDirectory?: string;
  load?: () => Promise<AutomationInventoryState>;
  prepare?: typeof prepareCatalogOperation;
  write?: (value: string) => void;
}): Promise<number>;
