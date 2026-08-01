import type {
  TavernKeeperReportIndex,
  TavernKeeperSourceRegistryEntry,
} from "./tavernkeeper-reports.mjs";

export function importTavernKeeperReports(options?: {
  root?: string;
  outputPath?: string;
  registry?: TavernKeeperSourceRegistryEntry[];
  fetchImpl?: typeof fetch;
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}): Promise<TavernKeeperReportIndex>;
