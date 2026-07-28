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
  if (count === 0) return `by ${attribution.owner.login}`;
  return `by ${attribution.owner.login}, plus ${count} ${
    count === 1 ? "contributor" : "contributors"
  }`;
}

export function attributionTooltip(attribution: CatalogAttribution) {
  const provider =
    attribution.owner.provider === "github" ? "GitHub" : "Codeberg";
  const parts = [`${provider} owner: ${attribution.owner.login}`];
  const { humans, botsOrAi } = contributorGroups(attribution);

  if (attribution.status === "pending") {
    parts.push("Contributor data pending");
  } else {
    if (humans.length > 0) {
      parts.push(`Contributors: ${humans.join(", ")}`);
    }
    if (botsOrAi.length > 0) {
      parts.push(`Bots/AI: ${botsOrAi.join(", ")}`);
    }
    if (attribution.status === "stale") {
      parts.push("Contributor data stale");
    } else if (attribution.status === "partial") {
      parts.push("Contributor history still scanning");
    }
  }

  return parts.join(" · ");
}

export function attributionAccessibleText(attribution: CatalogAttribution) {
  const provider =
    attribution.owner.provider === "github" ? "GitHub" : "Codeberg";
  const parts = [`${provider} repository owner: ${attribution.owner.login}.`];
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
  } else if (attribution.status === "partial") {
    parts.push("Contributor history still scanning.");
  }

  return parts.join(" ");
}
