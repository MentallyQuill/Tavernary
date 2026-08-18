import type {
  CatalogProjectV7,
  CatalogV7,
  CatalogValidationIssue,
} from "./catalog-types";
import {
  InstallContractValidationError,
  parseInstallContract,
} from "./install-contract";

const catalogKeys = [
  "generatedAt",
  "kits",
  "projects",
  "schemaVersion",
  "tagVocabulary",
].sort();

export class CatalogValidationError extends Error {
  readonly issues: CatalogValidationIssue[];

  constructor(issues: CatalogValidationIssue[]) {
    super(`Catalog schema 7 validation failed with ${issues.length} issue(s).`);
    this.name = "CatalogValidationError";
    this.issues = structuredClone(issues);
  }
}

export function parseCatalogV7(value: unknown): CatalogV7 {
  const issues: CatalogValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new CatalogValidationError([
      { path: "catalog", message: "Catalog must be an object." },
    ]);
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== catalogKeys.length ||
    keys.some((key, index) => key !== catalogKeys[index])
  ) {
    issues.push({
      path: "catalog",
      message: "Catalog top-level keys do not match schema 7.",
    });
  }
  if (value.schemaVersion !== 7) {
    issues.push({
      path: "schemaVersion",
      message: "Expected schema version 7.",
    });
  }
  if (typeof value.generatedAt !== "string" || !isIsoDate(value.generatedAt)) {
    issues.push({ path: "generatedAt", message: "Expected an ISO date-time." });
  }
  if (!Array.isArray(value.tagVocabulary)) {
    issues.push({ path: "tagVocabulary", message: "Expected an array." });
  }
  if (!Array.isArray(value.kits)) {
    issues.push({ path: "kits", message: "Expected an array." });
  }

  const projects: CatalogProjectV7[] = [];
  const projectIds = new Set<string>();
  if (!Array.isArray(value.projects)) {
    issues.push({ path: "projects", message: "Expected an array." });
  } else {
    value.projects.forEach((project, index) => {
      const path = `projects[${index}]`;
      if (!isRecord(project)) {
        issues.push({ path, message: "Project must be an object." });
        return;
      }
      if (typeof project.id !== "string" || project.id.length === 0) {
        issues.push({ path: `${path}.id`, message: "Project ID is required." });
      } else if (projectIds.has(project.id)) {
        issues.push({
          path: `${path}.id`,
          message: "Project ID must be unique.",
        });
      } else {
        projectIds.add(project.id);
      }
      if (!("install" in project)) {
        issues.push({
          path: `${path}.install`,
          message: "Install eligibility is required.",
        });
      } else if (project.install !== null) {
        try {
          parseInstallContract(project.install);
        } catch (cause) {
          const field =
            cause instanceof InstallContractValidationError &&
            cause.field !== "contract"
              ? `.${cause.field}`
              : "";
          issues.push({
            path: `${path}.install${field}`,
            message:
              cause instanceof Error
                ? cause.message
                : "Install contract is invalid.",
          });
        }
      }
      projects.push(project as unknown as CatalogProjectV7);
    });
  }

  if (issues.length > 0) throw new CatalogValidationError(issues);
  return structuredClone({
    schemaVersion: 7,
    generatedAt: value.generatedAt as string,
    tagVocabulary: value.tagVocabulary as unknown[],
    projects,
    kits: value.kits as unknown[],
  } as unknown as CatalogV7);
}

function isIsoDate(value: string): boolean {
  const timestamp = new Date(value);
  return (
    Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
