import type {
  TavernKeeperReportIndex,
  TavernKeeperSourceRegistryEntry,
} from "./tavernkeeper-reports.mjs";
import type { TavernKeeperImportState } from "./tavernkeeper-import-state.mjs";

export function loadTavernKeeperSourceRegistry(
  root?: string,
): Promise<TavernKeeperSourceRegistryEntry[]>;

export function validateStoredTavernKeeperReports(options?: {
  root?: string;
  inputPath?: string;
  registry?: TavernKeeperSourceRegistryEntry[];
}): Promise<TavernKeeperReportIndex>;

export function validateStoredTavernKeeperImportState(options?: {
  root?: string;
  inputPath?: string;
}): Promise<TavernKeeperImportState>;
