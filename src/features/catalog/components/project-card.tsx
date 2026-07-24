import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "../catalog-types";
import { ActivitySparkline } from "./activity-sparkline";

const kindLabels = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
};

function sourceStatusLabel(project: CatalogProject) {
  if (project.sourceStatus === "manual") return "Manual source";
  if (project.sourceStatus === "pending") return "Source pending";
  if (project.sourceStatus === "stale") return "Source stale";
  return null;
}

function detailItems(project: CatalogProject) {
  const items: string[] = [];
  const shouldExplainUnknownFacts =
    project.metadataStatus === "provisional" || project.sourceStatus !== "healthy";
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
  const days = Math.max(
    0,
    Math.floor(
      (new Date(now).getTime() - new Date(timestamp).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
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
  const communityId = `${project.id}-community`;
  const licenseId = `${project.id}-license`;
  const details = detailItems(project);
  const { activeWeeks12, latestMeaningfulCommitAt, twoWeekBars } =
    project.activity;
  const hasActivityMetrics =
    activeWeeks12 !== null &&
    twoWeekBars !== null &&
    latestMeaningfulCommitAt !== null;
  const repositorySizeLabel = formatSize(project.repositorySizeKb);

  return (
    <a
      className={`project-card kind-${project.kind}`}
      href={project.canonicalUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="card-top">
        <span className="card-identity">
          <span className="function-symbol">
            <CategoryIcon name={functionIcon} />
          </span>
          <span>{kindLabels[project.kind]}</span>
        </span>
        {project.kind === "preset" ? (
          <span className="development preset-development">
            {project.preset?.version ? (
              <b>{formatVersion(project.preset.version)}</b>
            ) : (
              <b>Preset</b>
            )}
            <span>
              {project.preset?.publishedAt
                ? `Published ${relativeTime(project.preset.publishedAt, now)}`
                : "Release unavailable"}
            </span>
            <span>
              {formatBytes(project.preset?.artifactSizeBytes ?? null) ??
                "File size unavailable"}
            </span>
          </span>
        ) : (
          <span className="development">
            {hasActivityMetrics ? (
              <>
                <Tooltip
                  id={activityId}
                  label={`Active ${activeWeeks12} of the last 12 weeks`}
                  className="activity-score"
                >
                  <b>{activeWeeks12}/12</b>
                  <ActivitySparkline bars={twoWeekBars} />
                </Tooltip>
                <span
                  className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
                >
                  {relativeTime(latestMeaningfulCommitAt, now)}
                </span>
              </>
            ) : (
              <span className="development-unavailable">Activity unavailable</span>
            )}
            {project.community ? (
              <Tooltip
                id={communityId}
                label={`${project.community.stars} stars, ${project.community.forks} forks, ${project.community.subscribers} subscribers`}
                className="community"
              >
                <CategoryIcon name="community" />
                <b>{project.community.aggregate}</b>
              </Tooltip>
            ) : null}
            {repositorySizeLabel ? (
              <span className="repository-size">{repositorySizeLabel}</span>
            ) : null}
          </span>
        )}
      </div>

      <h2>{project.name}</h2>
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
            <span className="chip frontend-chip" key={frontend.id}>
              {frontend.label}
            </span>
          ))}
          {project.capabilities.map((capability) => (
            <span className="chip" key={capability.id}>
              {capability.label}
            </span>
          ))}
        </span>
        <Tooltip
          id={licenseId}
          label={project.license.tooltip}
          className={`license license-${project.license.status}`}
        >
          {project.license.label}
        </Tooltip>
      </div>
    </a>
  );
}
