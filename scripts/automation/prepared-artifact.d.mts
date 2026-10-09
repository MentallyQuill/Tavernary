/** Decodes one explicitly supported bounded regular metadata entry without filesystem extraction. */
export function decodePreparedArtifact(input: {
  archive: Uint8Array;
  digest: string;
  filename?:
    | "result.json"
    | "diagnostic.json"
    | "revision.json"
    | "confirmation.json"
    | "restore-source.json";
}): unknown;
export function decodePreparedArtifactBytes(input: {
  archive: Uint8Array;
  digest: string;
  filename?:
    | "result.json"
    | "diagnostic.json"
    | "revision.json"
    | "confirmation.json"
    | "restore-source.json"
    | "site-bundle.tsb.gz";
}): Uint8Array;
