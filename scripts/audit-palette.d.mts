export const APPROVED_HEX: string[];

export interface PaletteViolation {
  file: string;
  line: number;
  value: string;
  message: string;
}

export function auditSource(file: string, source: string): PaletteViolation[];

export function auditProductionPalette(
  root?: string,
): Promise<PaletteViolation[]>;
