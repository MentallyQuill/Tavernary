export interface InstallContract {
  kind: "sillytavern-extension-git";
  repositoryUrl: string;
  branch: string | null;
  manifestPath: "manifest.json";
  folderName: string;
}

export interface CatalogProjectV7 extends Record<string, unknown> {
  id: string;
  install: InstallContract | null;
}

export interface CatalogV7 {
  schemaVersion: 7;
  generatedAt: string;
  tagVocabulary: unknown[];
  projects: CatalogProjectV7[];
  kits: unknown[];
}

export interface CatalogValidationIssue {
  path: string;
  message: string;
}
