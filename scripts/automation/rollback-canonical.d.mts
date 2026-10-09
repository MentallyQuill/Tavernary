export interface CurrentRollbackData {
  catalogDigest: string;
  targetDigest: string;
  ownerTombstones: string[];
}
export function readRollbackCanonicalData(input?: {
  root?: string;
}): Promise<CurrentRollbackData>;
