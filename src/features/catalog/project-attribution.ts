import type { CatalogAttribution } from "./catalog-types";

function contributorGroups(attribution: CatalogAttribution) {
  return {
    humans: attribution.contributors
      .filter(({ botOrAi }) => !botOrAi)
      .map(({ login }) => login),
    botsOrAi: attribution.contributors
      .filter(({ botOrAi }) => botOrAi)
      .map(({ login }) => login),
  };
}

export function attributionByline(attribution: CatalogAttribution) {
  const count = attribution.humanContributorCount;
  if (count === 0) return `by ${attribution.owner}`;
  return `by ${attribution.owner}, plus ${count} ${
    count === 1 ? "contributor" : "contributors"
  }`;
}

export function attributionTooltip(attribution: CatalogAttribution) {
  const parts = [`Owner: ${attribution.owner}`];
  const { humans, botsOrAi } = contributorGroups(attribution);

  if (attribution.status === "pending") {
    parts.push("Contributor data pending");
  } else if (humans.length === 0 && botsOrAi.length === 0) {
    parts.push("No additional contributors reported by GitHub");
  } else {
    if (humans.length > 0) {
      parts.push(`Contributors: ${humans.join(", ")}`);
    }
    if (botsOrAi.length > 0) {
      parts.push(`Bots/AI: ${botsOrAi.join(", ")}`);
    }
    if (attribution.status === "stale") {
      parts.push("Contributor data stale");
    }
  }

  return parts.join(" · ");
}

export function attributionAccessibleText(attribution: CatalogAttribution) {
  const parts = [`Repository owner: ${attribution.owner}.`];
  const { humans, botsOrAi } = contributorGroups(attribution);

  if (humans.length > 0) {
    parts.push(`Contributors: ${humans.join(", ")}.`);
  }
  if (botsOrAi.length > 0) {
    parts.push(`Bots and AI contributors: ${botsOrAi.join(", ")}.`);
  }
  if (attribution.status === "pending") {
    parts.push("Contributor data pending.");
  } else if (attribution.status === "stale") {
    parts.push("Contributor data stale.");
  }

  return parts.join(" ");
}
