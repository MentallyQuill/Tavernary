export interface EmojiFreeTextResult {
  value: string;
  removed: boolean;
}

export function stripEmoji(value: string): EmojiFreeTextResult;
