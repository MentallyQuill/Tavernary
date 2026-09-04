export function configuredBasePath(environment?: NodeJS.ProcessEnv): string;
export function verifyStaticExport(html: string, basePath?: string): void;
export function verifyMenuStaticRoutes(outputDirectory?: string): Promise<void>;
export function verifyTavernKeeperStaticExport(
  outputDirectory?: string,
): Promise<void>;
export function verifyCatalogStaticExport(
  outputDirectory?: string,
  publicDirectory?: string,
  sourceRoot?: string,
): Promise<void>;
