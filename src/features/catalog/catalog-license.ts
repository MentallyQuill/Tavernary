import type { LicenseFilter } from "./catalog-query";
import type { CatalogProject } from "./catalog-types";

export function licenseFilter(project: CatalogProject): LicenseFilter {
  if (project.license.status === "osi-approved") {
    return "open-source";
  }
  if (project.license.status === "pending") {
    return "missing";
  }
  return project.license.status;
}
