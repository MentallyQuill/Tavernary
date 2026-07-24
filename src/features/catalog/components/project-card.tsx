import type { CSSProperties } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "../catalog-types";
import { CATEGORY_OPTIONS } from "../catalog-query";
import { commitFreshnessPercent, daysSince } from "../commit-freshness";
import { ActivitySparkline } from "./activity-sparkline";

const kindLabels = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
};

function typeTooltip(primaryFunction: string, kind: CatalogProject["kind"]) {
  if (
    kind === "frontend" &&
    primaryFunction.toLocaleLowerCase().startsWith("frontend")
  ) {
    return "Frontend";
  }
  return `${primaryFunction} ${kindLabels[kind]}`;
}

function licenseTooltip(project: CatalogProject) {
  if (project.license.status === "osi-approved") {
    return `${project.license.label} is OSI-approved`;
  }
  if (project.license.status === "proprietary") {
    return "Proprietary license";
  }
  if (project.license.status === "pending") {
    return "License pending verification";
  }
  return "No license detected";
}

function sourceStatusLabel(project: CatalogProject) {
  if (project.sourceStatus === "manual") return "Manual source";
  if (project.sourceStatus === "pending") return "Source pending";
  if (project.sourceStatus === "stale") return "Source stale";
  return null;
}

function detailItems(project: CatalogProject) {
  const items: string[] = [];
  const shouldExplainUnknownFacts =
    project.metadataStatus === "provisional" ||
    project.sourceStatus !== "healthy";
  if (project.metadataStatus === "provisional") {
    items.push("Provisional details");
  }
  const sourceLabel = sourceStatusLabel(project);
  if (sourceLabel) {
    items.push(sourceLabel);
  }
  if (
    shouldExplainUnknownFacts &&
    project.kind === "preset" &&
    (project.activity.activeWeeks12 === null || !project.activity.twoWeekBars)
  ) {
    items.push("Activity unavailable");
  }
  if (
    shouldExplainUnknownFacts &&
    !project.latestReleaseAt &&
    !project.preset?.publishedAt
  ) {
    items.push("Release unavailable");
  }
  if (shouldExplainUnknownFacts && project.community === null) {
    items.push("Popularity unavailable");
  }
  if (shouldExplainUnknownFacts && project.repositorySizeKb === null) {
    items.push("Repository size unavailable");
  }
  return items;
}

function relativeTime(timestamp: string | null, now: string) {
  if (!timestamp) return "No activity";
  const days = daysSince(timestamp, now) ?? 0;
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatSize(kilobytes: number | null) {
  if (kilobytes === null) return null;
  return kilobytes >= 1024
    ? `${(kilobytes / 1024).toFixed(1)} MB repo`
    : `${kilobytes} KB repo`;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return null;
  return bytes >= 1024
    ? `${Math.round(bytes / 1024)} KB file`
    : `${bytes} B file`;
}

function formatVersion(version: string) {
  return /^\d+(?:\.\d+)*$/.test(version) ? `v${version}` : version;
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

export function ProjectCard({
  project,
  now,
}: {
  project: CatalogProject;
  now: string;
}) {
  const functionIcon = project.primaryFunction as Parameters<
    typeof CategoryIcon
  >[0]["name"];
  const activityId = `${project.id}-activity`;
  const commitId = `${project.id}-commit`;
  const communityId = `${project.id}-community`;
  const repositorySizeId = `${project.id}-repository-size`;
  const typeId = `${project.id}-type`;
  const titleId = `${project.id}-title`;
  const licenseId = `${project.id}-license`;
  const cardDescriptionId = `${project.id}-card-description`;
  const primaryFunction =
    CATEGORY_OPTIONS.find(({ id }) => id === project.primaryFunction)?.label ??
    project.primaryFunction;
  const commitAge = relativeTime(
    project.activity.latestMeaningfulCommitAt,
    now,
  );
  const commitFreshness = commitFreshnessPercent(
    project.activity.latestMeaningfulCommitAt,
    now,
  );
  const commitAgeStyle = {
    "--commit-freshness": `${commitFreshness}%`,
  } as CSSProperties;
  const repositorySize = formatSize(project.repositorySizeKb);
  const presetVersion = project.preset?.version
    ? formatVersion(project.preset.version)
    : "Preset";
  const presetPublication = project.preset?.publishedAt
    ? `Published ${relativeTime(project.preset.publishedAt, now)}`
    : "Source linked";
  const presetSize = formatBytes(project.preset?.artifactSizeBytes ?? null);
  const details = detailItems(project);
  const { activeWeeks12, latestMeaningfulCommitAt, twoWeekBars } =
    project.activity;
  const hasActivityMetrics =
    activeWeeks12 !== null &&
    twoWeekBars !== null &&
    latestMeaningfulCommitAt !== null;
  const cardDescription = [
    `${kindLabels[project.kind]} project. Primary category: ${primaryFunction}.`,
    ...details.map((detail) => `${detail}.`),
    project.activity.activeWeeks12 !== null
      ? `Active in ${project.activity.activeWeeks12} of the last 12 weeks.`
      : null,
    `Last activity: ${commitAge}.`,
    project.community
      ? `Community score: ${project.community.aggregate}.`
      : null,
    repositorySize ? `Repository size: ${repositorySize}.` : null,
    project.frontends.length
      ? `Compatible frontends: ${project.frontends.map(({ label }) => label).join(", ")}.`
      : null,
    project.capabilities.length
      ? `Capabilities: ${project.capabilities.map(({ label }) => label).join(", ")}.`
      : null,
    `License: ${project.license.label}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      className={`project-card kind-${project.kind}`}
      href={project.canonicalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={project.name}
      aria-describedby={cardDescriptionId}
    >
      <span className="visually-hidden" id={cardDescriptionId}>
        {cardDescription}
      </span>
      <div className="card-top">
        <Tooltip
          id={typeId}
          label={typeTooltip(primaryFunction, project.kind)}
          className="card-identity"
        >
          <span className="function-symbol">
            <CategoryIcon name={functionIcon} />
          </span>
          <span>{kindLabels[project.kind]}</span>
        </Tooltip>
        {project.kind === "preset" ? (
          <span className="development preset-development">
            <Tooltip
              id={`${project.id}-preset-version`}
              label={`Preset version ${presetVersion}`}
              className="preset-version"
            >
              {presetVersion}
            </Tooltip>
            <Tooltip
              id={`${project.id}-preset-publication`}
              label={
                project.preset?.publishedAt
                  ? `Published ${formatDate(project.preset.publishedAt)}`
                  : "Published source"
              }
              className="preset-publication"
            >
              {presetPublication}
            </Tooltip>
            <Tooltip
              id={`${project.id}-preset-size`}
              label={presetSize ? presetSize : "File size unavailable"}
              className="preset-size"
            >
              {presetSize}
            </Tooltip>
          </span>
        ) : (
          <span className="development">
            {hasActivityMetrics ? (
              <>
                <Tooltip
                  id={activityId}
                  label={`Active in ${activeWeeks12} of the last 12 weeks`}
                  className="activity-score"
                >
                  <b>{activeWeeks12}/12</b>
                  <ActivitySparkline bars={twoWeekBars} />
                </Tooltip>
                <Tooltip
                  id={commitId}
                  label={`Last commit ${formatDate(latestMeaningfulCommitAt)} (${commitAge})`}
                  className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
                  style={commitAgeStyle}
                >
                  {commitAge}
                </Tooltip>
              </>
            ) : (
              <span className="development-unavailable">
                Activity unavailable
              </span>
            )}
            {project.community ? (
              <Tooltip
                id={communityId}
                label={`${project.community.aggregate} total: ${project.community.stars} stars, ${project.community.forks} forks, ${project.community.subscribers} subscribers`}
                className="community"
              >
                <CategoryIcon name="community" />
                <b>{project.community.aggregate}</b>
              </Tooltip>
            ) : null}
            {repositorySize ? (
              <Tooltip
                id={repositorySizeId}
                label={`${repositorySize.replace(" repo", "")} repository`}
                className="repository-size"
              >
                {repositorySize}
              </Tooltip>
            ) : null}
          </span>
        )}
      </div>

      <h2>
        <Tooltip
          id={titleId}
          label={project.summary}
          className="card-title"
          showOnAncestorFocus
        >
          {project.name}
        </Tooltip>
      </h2>
      {details.length > 0 ? (
        <ul className="card-state-list" aria-label="Project details">
          {details.map((detail) => (
            <li className="card-state-note" key={detail}>
              {detail}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="card-summary">{project.summary}</p>

      <div className="card-bottom">
        <span className="card-chips">
          {project.frontends.map((frontend) => (
            <Tooltip
              id={`${project.id}-frontend-${frontend.id}`}
              label={frontend.description}
              className="chip frontend-chip"
              key={frontend.id}
            >
              {frontend.label}
            </Tooltip>
          ))}
          {project.capabilities.map((capability) => (
            <Tooltip
              id={`${project.id}-capability-${capability.id}`}
              label={capability.description}
              className="chip"
              key={capability.id}
            >
              {capability.label}
            </Tooltip>
          ))}
        </span>
        <Tooltip
          id={licenseId}
          label={licenseTooltip(project)}
          className={`license license-${project.license.status}`}
        >
          {project.license.label}
        </Tooltip>
      </div>
    </a>
  );
}
