export function configuredBasePath(environment?: NodeJS.ProcessEnv): string;
export function verifyStaticExport(html: string, basePath?: string): void;
export function verifyHelpStaticRoutes(outputDirectory?: string): Promise<void>;
