import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import type {
  CatalogProjectV7,
  CatalogV7,
  CatalogV8,
  CatalogValidationIssue,
} from "./catalog-types";
import { catalogV7Schema } from "./catalog-v7-schema";
import { catalogV8Schema } from "./catalog-v8-schema";
import {
  InstallContractValidationError,
  parseInstallContract,
} from "./install-contract";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addFormat("safe-http-url", {
  type: "string",
  validate: (value: string) => isSafeHttpUrl(value),
});
ajv.addFormat("safe-navigation-url", {
  type: "string",
  validate: (value: string) => isSafeNavigationUrl(value),
});
const validateCatalogV7 = ajv.compile(catalogV7Schema);
const validateCatalogV8 = ajv.compile(catalogV8Schema);

export class CatalogValidationError extends Error {
  readonly issues: CatalogValidationIssue[];

  constructor(issues: CatalogValidationIssue[], schemaVersion = 7) {
    super(
      `Catalog schema ${schemaVersion} validation failed with ${issues.length} issue(s).`,
    );
    this.name = "CatalogValidationError";
    this.issues = structuredClone(issues);
  }
}

export function parseCatalogV7(value: unknown): CatalogV7 {
  if (!validateCatalogV7(value)) {
    throw new CatalogValidationError(
      (validateCatalogV7.errors ?? []).map(schemaIssue),
    );
  }

  const catalog = validateSemantics(value as CatalogV7, 7);
  const projects = [
    ...catalog.projects,
    ...catalog.kits.flatMap((kit) =>
      kit.components.flatMap((component) =>
        component.project ? [component.project] : [],
      ),
    ),
  ];
  for (const project of projects) {
    if (!project.tavernKeeper) continue;
    if (project.tavernKeeper.report) {
      project.tavernKeeper.report.javascriptAnalysisStatus = null;
    }
    for (const report of project.tavernKeeper.history) {
      report.javascriptAnalysisStatus = null;
    }
  }
  return catalog;
}

export function parseCatalogV8(value: unknown): CatalogV8 {
  if (!validateCatalogV8(value)) {
    throw new CatalogValidationError(
      (validateCatalogV8.errors ?? []).map(schemaIssue),
      8,
    );
  }
  return validateSemantics(value as CatalogV8, 8);
}

function validateSemantics<T extends CatalogV7 | CatalogV8>(
  value: T,
  schemaVersion: 7 | 8,
): T {
  const issues: CatalogValidationIssue[] = [];
  const projects = value.projects as CatalogProjectV7[];
  const projectIds = new Set<string>();
  projects.forEach((project, index) => {
    const path = `projects[${index}]`;
    if (projectIds.has(project.id)) {
      issues.push({
        path: `${path}.id`,
        message: "Project ID must be unique.",
      });
    } else {
      projectIds.add(project.id);
    }
    if (project.install !== null) {
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
  });

  const kitIds = new Set<string>();
  value.kits.forEach((kit, index) => {
    if (kitIds.has(kit.id)) {
      issues.push({
        path: `kits[${index}].id`,
        message: "Kit ID must be unique.",
      });
    }
    kitIds.add(kit.id);
  });
  const tagIds = new Set<string>();
  value.tagVocabulary.forEach((tag, index) => {
    if (tagIds.has(tag.id)) {
      issues.push({
        path: `tagVocabulary[${index}].id`,
        message: "Tag ID must be unique.",
      });
    }
    tagIds.add(tag.id);
  });

  if (issues.length > 0) {
    throw new CatalogValidationError(issues, schemaVersion);
  }
  return structuredClone(value);
}

function schemaIssue(error: ErrorObject): CatalogValidationIssue {
  let path = pointerToPath(error.instancePath);
  if (error.keyword === "required") {
    const missing = String(error.params.missingProperty ?? "");
    path = path === "catalog" ? missing : `${path}.${missing}`;
  } else if (error.keyword === "additionalProperties") {
    const unexpected = String(error.params.additionalProperty ?? "");
    path = path === "catalog" ? unexpected : `${path}.${unexpected}`;
  }
  return { path, message: error.message ?? "Value is invalid." };
}

function pointerToPath(pointer: string): string {
  if (pointer.length === 0) return "catalog";
  return pointer
    .split("/")
    .slice(1)
    .reduce((path, rawSegment) => {
      const segment = rawSegment.replace(/~1/gu, "/").replace(/~0/gu, "~");
      if (/^\d+$/u.test(segment)) return `${path}[${segment}]`;
      return path.length === 0 ? segment : `${path}.${segment}`;
    }, "");
}

function isSafeHttpUrl(value: string): boolean {
  if (hasControl(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isSafeNavigationUrl(value: string): boolean {
  if (isSafeHttpUrl(value)) return true;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControl(value)
  ) {
    return false;
  }
  try {
    const base = new URL("https://tavernary.invalid/");
    return new URL(value, base).origin === base.origin;
  } catch {
    return false;
  }
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}
