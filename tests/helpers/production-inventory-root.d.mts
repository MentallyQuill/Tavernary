export function productionInventoryRoot(source?: string): Promise<{
  root: string;
  revision: string;
  cleanup(): Promise<void>;
}>;
