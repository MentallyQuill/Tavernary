import type {
  TavernKeeperReportIndex,
  TavernKeeperSourceRegistryEntry,
} from "./tavernkeeper-reports.mjs";

export function importTavernKeeperReports(options?: {
  root?: string;
  outputPath?: string;
  timeoutMs?: number;
  registry?: TavernKeeperSourceRegistryEntry[];
  fetchImpl?: typeof fetch;
  requestImpl?: Parameters<
    typeof import("./tavernkeeper-reports.mjs").fetchAndValidateTavernKeeperIndex
  >[0]["requestImpl"];
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}): Promise<TavernKeeperReportIndex>;
