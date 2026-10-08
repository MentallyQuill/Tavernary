/** Decodes one explicitly supported bounded regular metadata entry without filesystem extraction. */
export function decodePreparedArtifact(input: {
  archive: Uint8Array;
  digest: string;
  filename?:
    "result.json" | "diagnostic.json" | "revision.json" | "confirmation.json";
}): unknown;
