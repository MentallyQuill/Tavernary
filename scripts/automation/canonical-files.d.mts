export interface CanonicalFileRequest {
  root: string;
  revision: string;
  paths: string[];
}
export function readCanonicalFiles(
  input: CanonicalFileRequest,
): Record<string, Buffer>;
export function canonicalFileDigests(
  input: CanonicalFileRequest,
): Record<string, string>;
export function publicationHistory(
  input: CanonicalFileRequest,
): Promise<Record<string, string>>;
