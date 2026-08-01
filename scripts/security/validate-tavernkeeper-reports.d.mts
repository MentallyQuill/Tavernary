import type {
  TavernKeeperReportIndex,
  TavernKeeperSourceRegistryEntry,
} from "./tavernkeeper-reports.mjs";

export function loadTavernKeeperSourceRegistry(
  root?: string,
): Promise<TavernKeeperSourceRegistryEntry[]>;

export function validateStoredTavernKeeperReports(options?: {
  root?: string;
  inputPath?: string;
  registry?: TavernKeeperSourceRegistryEntry[];
}): Promise<TavernKeeperReportIndex>;
