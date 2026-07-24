import { CategoryIcon } from "@/components/icons/category-icon";
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
  missing: "Missing license",
};

export function ActiveQuery({
  query,
  projects,
  onRemove,
  onClear,
}: {
  query: CatalogQuery;
  projects: CatalogProject[];
  onRemove: (key: keyof CatalogQuery, value?: string) => void;
  onClear: () => void;
}) {
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
