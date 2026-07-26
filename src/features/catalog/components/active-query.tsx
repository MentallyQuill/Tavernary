import { CategoryIcon } from "@/components/icons/category-icon";
import type { KitQuery } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";
import { CATEGORY_OPTIONS, type CatalogQuery } from "../catalog-query";
import type { CatalogProject } from "../catalog-types";

function labelMaps(projects: CatalogProject[]) {
  const frontends = new Map<string, string>();
  const capabilities = new Map<string, string>();
  for (const project of projects) {
    for (const item of project.frontends) frontends.set(item.id, item.label);
    for (const item of project.capabilities)
      capabilities.set(item.id, item.label);
  }
  return { frontends, capabilities };
}

const staticLabels: Record<string, string> = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
  "active-month": "Active this month",
  "new-release": "Recently released",
  dormant: "Dormant",
  "open-source": "Open source",
  proprietary: "Proprietary",
  pending: "Pending verification",
  missing: "Missing license",
};

export function ActiveQuery({
  query,
  projects,
  kits = [],
  onRemove,
  onRemoveKit,
  onClear,
}: {
  query: CatalogQuery;
  projects: CatalogProject[];
  kits?: CatalogKit[];
  onRemove: (key: keyof CatalogQuery, value?: string) => void;
  onRemoveKit?: (key: keyof KitQuery, value?: string) => void;
  onClear: () => void;
}) {
  if (query.mode === "kits") {
    const kitLabels = new Map(
      kits.flatMap((kit) => [
        ...kit.frontends.map((item) => [item.id, item.label] as const),
        ...kit.purposes.map((item) => [item.id, item.label] as const),
      ]),
    );
    const tokens: Array<{
      key: keyof KitQuery | "search";
      value?: string;
      label: string;
    }> = [];
    const projectLabels = new Map(
      projects.map((project) => [project.id, project.name] as const),
    );
    if (query.search)
      tokens.push({ key: "search", label: `Search: ${query.search}` });
    for (const value of query.kits.frontends)
      tokens.push({
        key: "frontends",
        value,
        label: kitLabels.get(value) ?? value,
      });
    for (const value of query.kits.purposes)
      tokens.push({
        key: "purposes",
        value,
        label: kitLabels.get(value) ?? value,
      });
    if (query.kits.includesProjectId)
      tokens.push({
        key: "includesProjectId",
        label: `Includes: ${
          projectLabels.get(query.kits.includesProjectId) ??
          query.kits.includesProjectId
        }`,
      });
    if (query.kits.minProjects !== 3 || query.kits.maxProjects !== 50)
      tokens.push({
        key: "minProjects",
        label: `${query.kits.minProjects}–${query.kits.maxProjects} projects`,
      });
    if (query.kits.allComponentsAvailable)
      tokens.push({
        key: "allComponentsAvailable",
        label: "All components available",
      });
    if (tokens.length === 0) return null;
    return (
      <div className="active-query" aria-label="Active filters">
        {tokens.map((token) => (
          <button
            key={`${token.key}-${token.value ?? token.label}`}
            type="button"
            aria-label={`Remove ${token.label}`}
            onClick={() =>
              token.key === "search"
                ? onRemove("search")
                : onRemoveKit?.(token.key, token.value)
            }
          >
            <span>{token.label}</span>
            <CategoryIcon name="close" />
          </button>
        ))}
        <button className="clear-query" type="button" onClick={onClear}>
          Clear all
        </button>
      </div>
    );
  }

  const maps = labelMaps(projects);
  const tokens: Array<{
    key: keyof CatalogQuery;
    value?: string;
    label: string;
  }> = [];
  if (query.search)
    tokens.push({ key: "search", label: `Search: ${query.search}` });
  if (query.category) {
    tokens.push({
      key: "category",
      label:
        CATEGORY_OPTIONS.find(({ id }) => id === query.category)?.label ??
        query.category,
    });
  }
  for (const value of query.frontends)
    tokens.push({
      key: "frontends",
      value,
      label: maps.frontends.get(value) ?? value,
    });
  for (const value of query.kinds)
    tokens.push({
      key: "kinds",
      value,
      label: staticLabels[value] ?? value,
    });
  for (const value of query.capabilities)
    tokens.push({
      key: "capabilities",
      value,
      label: maps.capabilities.get(value) ?? value,
    });
  for (const value of query.development)
    tokens.push({
      key: "development",
      value,
      label: staticLabels[value] ?? value,
    });
  for (const value of query.licenses)
    tokens.push({
      key: "licenses",
      value,
      label: staticLabels[value] ?? value,
    });

  if (tokens.length === 0) return null;

  return (
    <div className="active-query" aria-label="Active filters">
      {tokens.map((token) => (
        <button
          key={`${token.key}-${token.value ?? token.label}`}
          type="button"
          aria-label={`Remove ${token.label}`}
          onClick={() => onRemove(token.key, token.value)}
        >
          <span>{token.label}</span>
          <CategoryIcon name="close" />
        </button>
      ))}
      <button className="clear-query" type="button" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}
