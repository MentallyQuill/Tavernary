import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import type {
  CatalogProjectV7,
  CatalogV7,
  CatalogValidationIssue,
} from "./catalog-types";
import { catalogV7Schema } from "./catalog-v7-schema";
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
  validate: (value: string) =>
    isSafeHttpUrl(value) ||
    (value.startsWith("/") && !value.startsWith("//") && !hasControl(value)),
});
const validateCatalog = ajv.compile(catalogV7Schema);

export class CatalogValidationError extends Error {
  readonly issues: CatalogValidationIssue[];

  constructor(issues: CatalogValidationIssue[]) {
    super(`Catalog schema 7 validation failed with ${issues.length} issue(s).`);
    this.name = "CatalogValidationError";
    this.issues = structuredClone(issues);
  }
}

export function parseCatalogV7(value: unknown): CatalogV7 {
  if (!validateCatalog(value)) {
    throw new CatalogValidationError(
      (validateCatalog.errors ?? []).map(schemaIssue),
    );
  }

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
  (value.kits as CatalogV7["kits"]).forEach((kit, index) => {
    if (kitIds.has(kit.id)) {
      issues.push({
        path: `kits[${index}].id`,
        message: "Kit ID must be unique.",
      });
    }
    kitIds.add(kit.id);
  });
  const tagIds = new Set<string>();
  (value.tagVocabulary as CatalogV7["tagVocabulary"]).forEach((tag, index) => {
    if (tagIds.has(tag.id)) {
      issues.push({
        path: `tagVocabulary[${index}].id`,
        message: "Tag ID must be unique.",
      });
    }
    tagIds.add(tag.id);
  });

  if (issues.length > 0) throw new CatalogValidationError(issues);
  return structuredClone(value as CatalogV7);
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

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}
