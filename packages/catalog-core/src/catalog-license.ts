import type { LicenseFilter } from "./project-query";
import type { CatalogProject } from "./catalog-types";

export function licenseFilter(project: CatalogProject): LicenseFilter {
  if (project.license.status === "osi-approved") {
    return "open-source";
  }
  return project.license.status;
}
