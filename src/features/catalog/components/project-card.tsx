import type { CSSProperties } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "../catalog-types";
import { CATEGORY_OPTIONS } from "../catalog-query";
import { commitFreshnessPercent, daysSince } from "../commit-freshness";
import {
  attributionAccessibleText,
  attributionByline,
  attributionTooltip,
} from "../project-attribution";
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
  if (project.sourceStatus === "manual") {
    return project.kind === "preset" ? null : "Manual source";
  }
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

  if (project.kind === "preset") {
    return items;
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

export function projectDisplayName(name: string) {
  const withoutPrefix = name.replace(/^sillytavern[\s_-]+/i, "");
  return withoutPrefix || name;
}

function missingSourceActivityStatus(
  evidenceStatus: CatalogProject["activity"]["evidenceStatus"],
) {
  if (evidenceStatus === "complete") {
    return {
      short: "Quiet",
      full: "No source activity in the last 12 weeks",
    };
  }
  if (evidenceStatus === "provisional") {
    return {
      short: "Pending",
      full: "Source activity baseline pending",
    };
  }
  return {
    short: "Partial",
    full: "Source activity evidence incomplete",
  };
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
  const attributionId = `${project.id}-attribution`;
  const licenseId = `${project.id}-license`;
  const cardDescriptionId = `${project.id}-card-description`;
  const displayName = projectDisplayName(project.name);
  const primaryFunction =
    CATEGORY_OPTIONS.find(({ id }) => id === project.primaryFunction)?.label ??
    project.primaryFunction;
  const sourceActivityAge = relativeTime(
    project.activity.latestSourceActivityAt,
    now,
  );
  const sourceActivityFreshness = commitFreshnessPercent(
    project.activity.latestSourceActivityAt,
    now,
  );
  const sourceActivityAgeStyle = {
    "--commit-freshness": `${sourceActivityFreshness}%`,
  } as CSSProperties;
  const repositorySize = formatSize(project.repositorySizeKb);
  const presetVersion = project.preset?.version
    ? formatVersion(project.preset.version)
    : null;
  const presetPublishedAt = project.preset?.publishedAt ?? null;
  const presetPublication = presetPublishedAt
    ? `Published ${relativeTime(presetPublishedAt, now)}`
    : null;
  const presetSize = formatBytes(project.preset?.artifactSizeBytes ?? null);
  const details = detailItems(project);
  const {
    activeWeeks12,
    latestSourceActivityAt,
    weeklyActivity,
    evidenceStatus,
  } = project.activity;
  const hasActivityMetrics = activeWeeks12 !== null && weeklyActivity !== null;
  const missingSourceActivity =
    hasActivityMetrics && !latestSourceActivityAt
      ? missingSourceActivityStatus(evidenceStatus)
      : null;
  const activitySummary =
    activeWeeks12 === null
      ? null
      : evidenceStatus === "provisional"
        ? `Approximate activity in ${activeWeeks12} of the last 12 weeks; baseline pending`
        : `Source activity in ${activeWeeks12} of the last 12 weeks`;
  const activityLabel =
    activitySummary && evidenceStatus === "degraded"
      ? `${activitySummary}; activity evidence is incomplete`
      : activitySummary;
  const cardDescription = [
    `${kindLabels[project.kind]} project. Primary category: ${primaryFunction}.`,
    ...details.map((detail) => `${detail}.`),
    activitySummary ? `${activitySummary}.` : null,
    evidenceStatus === "degraded" ? "Activity evidence is incomplete." : null,
    latestSourceActivityAt
      ? `Last source activity: ${sourceActivityAge}.`
      : evidenceStatus === "complete"
        ? "No source activity in the last 12 weeks."
        : null,
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
    project.preset?.modelFamilies?.length
      ? `Supported model families: ${project.preset.modelFamilies.map(({ label }) => label).join(", ")}.`
      : null,
    project.preset?.completionFormats?.length
      ? `Supported completion formats: ${project.preset.completionFormats.map(({ label }) => label).join(", ")}.`
      : null,
    project.attribution ? attributionAccessibleText(project.attribution) : null,
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
      aria-label={displayName}
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
          presetVersion || presetPublication || presetSize ? (
            <span className="development preset-development">
              {presetVersion ? (
                <Tooltip
                  id={`${project.id}-preset-version`}
                  label={`Preset version ${presetVersion}`}
                  className="preset-version"
                >
                  {presetVersion}
                </Tooltip>
              ) : null}
              {presetPublishedAt && presetPublication ? (
                <Tooltip
                  id={`${project.id}-preset-publication`}
                  label={`Published ${formatDate(presetPublishedAt)}`}
                  className="preset-publication"
                >
                  {presetPublication}
                </Tooltip>
              ) : null}
              {presetSize ? (
                <Tooltip
                  id={`${project.id}-preset-size`}
                  label={presetSize}
                  className="preset-size"
                >
                  {presetSize}
                </Tooltip>
              ) : null}
            </span>
          ) : null
        ) : (
          <span className="development">
            {hasActivityMetrics ? (
              <>
                <Tooltip
                  id={activityId}
                  label={activityLabel ?? ""}
                  ariaLabel={activityLabel ?? undefined}
                  className={`activity-score evidence-${evidenceStatus}`}
                >
                  <b>
                    {evidenceStatus === "provisional" ? "~" : ""}
                    {activeWeeks12}/12
                  </b>
                  <ActivitySparkline weeks={weeklyActivity} />
                </Tooltip>
                {latestSourceActivityAt ? (
                  <Tooltip
                    id={commitId}
                    label={`Last source activity ${formatDate(latestSourceActivityAt)} (${sourceActivityAge})`}
                    className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
                    style={sourceActivityAgeStyle}
                  >
                    {sourceActivityAge}
                  </Tooltip>
                ) : missingSourceActivity ? (
                  <Tooltip
                    id={commitId}
                    label={missingSourceActivity.full}
                    ariaLabel={missingSourceActivity.full}
                    className="commit-age no-source-activity"
                  >
                    {missingSourceActivity.short}
                  </Tooltip>
                ) : null}
              </>
            ) : (
              <Tooltip
                id={activityId}
                label="Activity unavailable"
                ariaLabel="Activity unavailable"
                className="development-unavailable"
              >
                No data
              </Tooltip>
            )}
            {project.community ? (
              <Tooltip
                id={communityId}
                label={`${project.community.aggregate} total: ${project.community.stars} stars, ${project.community.forks} forks, ${project.community.watchers} watchers`}
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
          {displayName}
        </Tooltip>
      </h2>
      {project.attribution ? (
        <Tooltip
          id={attributionId}
          label={attributionTooltip(project.attribution)}
          className="card-attribution"
        >
          {attributionByline(project.attribution)}
        </Tooltip>
      ) : null}
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
          {project.preset?.modelFamilies?.map((family) => (
            <Tooltip
              id={`${project.id}-model-${family.id}`}
              label={family.description}
              className="chip"
              key={family.id}
            >
              {family.label}
            </Tooltip>
          ))}
          {project.preset?.completionFormats?.map((format) => (
            <Tooltip
              id={`${project.id}-completion-${format.id}`}
              label={format.description}
              className="chip"
              key={format.id}
            >
              {format.label}
            </Tooltip>
          ))}
        </span>
        <div className="card-utility">
          <Tooltip
            id={licenseId}
            label={licenseTooltip(project)}
            className={`license license-${project.license.status}`}
          >
            {project.license.label}
          </Tooltip>
        </div>
      </div>
    </a>
  );
}
