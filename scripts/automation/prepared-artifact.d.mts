/** Decodes one bounded regular result.json entry without filesystem extraction. */
export function decodePreparedArtifact(input: {
  archive: Uint8Array;
  digest: string;
}): unknown;
