import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "../catalog-types";
import { CATEGORY_OPTIONS } from "../catalog-query";
import { ActivitySparkline } from "./activity-sparkline";

const kindLabels = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
};

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
  const summaryId = `${project.id}-summary`;
  const licenseId = `${project.id}-license`;
  const primaryFunction =
    CATEGORY_OPTIONS.find(({ id }) => id === project.primaryFunction)?.label ??
    project.primaryFunction;
  const commitAge = relativeTime(
    project.activity.latestMeaningfulCommitAt,
    now,
  );
  const repositorySize = formatSize(project.repositorySizeKb);
  const presetVersion = project.preset?.version
    ? formatVersion(project.preset.version)
    : "Preset";
  const presetPublication = project.preset?.publishedAt
    ? `Published ${relativeTime(project.preset.publishedAt, now)}`
    : "Source linked";
  const presetSize = formatBytes(project.preset?.artifactSizeBytes ?? null);

  return (
    <a
      className={`project-card kind-${project.kind}`}
      href={project.canonicalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={project.name}
    >
      <div className="card-top">
        <Tooltip
          id={typeId}
          label={`${kindLabels[project.kind]} — ${primaryFunction}. This icon shows the project's primary catalog category.`}
          className="card-identity"
          align="left"
        >
          <span className="function-symbol">
            <CategoryIcon name={functionIcon} />
          </span>
          <span>{kindLabels[project.kind]}</span>
        </Tooltip>
        {project.activity.activeWeeks12 !== null &&
        project.activity.twoWeekBars ? (
          <span className="development">
            <Tooltip
              id={activityId}
              label={`Active in ${project.activity.activeWeeks12} of the last 12 weeks. The six bars show two-week commit totals.`}
              className="activity-score"
            >
              <b>{project.activity.activeWeeks12}/12</b>
              <ActivitySparkline bars={project.activity.twoWeekBars} />
            </Tooltip>
            <Tooltip
              id={commitId}
              label={
                project.activity.latestMeaningfulCommitAt
                  ? `Last meaningful commit: ${formatDate(project.activity.latestMeaningfulCommitAt)} (${commitAge}).`
                  : "No meaningful commit date is available."
              }
              className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
            >
              {commitAge}
            </Tooltip>
            {project.community ? (
              <Tooltip
                id={communityId}
                label={`Community score: ${project.community.aggregate} total — ${project.community.stars} stars, ${project.community.forks} forks, and ${project.community.subscribers} subscribers.`}
                className="community"
                align="left"
              >
                <CategoryIcon name="community" />
                <b>{project.community.aggregate}</b>
              </Tooltip>
            ) : null}
            <Tooltip
              id={repositorySizeId}
              label={
                repositorySize
                  ? `Repository size reported by GitHub: ${repositorySize.replace(" repo", "")}.`
                  : "GitHub did not report a repository size."
              }
              className="repository-size"
            >
              {repositorySize}
            </Tooltip>
          </span>
        ) : (
          <span className="development preset-development">
            <Tooltip
              id={`${project.id}-preset-version`}
              label={`Published preset version: ${presetVersion}.`}
              className="preset-version"
              align="left"
            >
              {presetVersion}
            </Tooltip>
            <Tooltip
              id={`${project.id}-preset-publication`}
              label={
                project.preset?.publishedAt
                  ? `Source publication date: ${formatDate(project.preset.publishedAt)}.`
                  : "The preset links directly to its published source."
              }
              className="preset-publication"
            >
              {presetPublication}
            </Tooltip>
            <Tooltip
              id={`${project.id}-preset-size`}
              label={
                presetSize
                  ? `Published preset file size: ${presetSize.replace(" file", "")}.`
                  : "The published source does not report a preset file size."
              }
              className="preset-size"
            >
              {presetSize}
            </Tooltip>
          </span>
        )}
      </div>

      <h2>
        <Tooltip
          id={titleId}
          label={`Open ${project.name} at its published source.`}
          className="card-title"
          align="left"
        >
          {project.name}
        </Tooltip>
      </h2>
      <p className="card-summary">
        <Tooltip
          id={summaryId}
          label={project.summary}
          className="card-summary-tooltip"
          align="left"
        >
          {project.summary}
        </Tooltip>
      </p>

      <div className="card-bottom">
        <span className="card-chips">
          {project.frontends.map((frontend) => (
            <Tooltip
              id={`${project.id}-frontend-${frontend.id}`}
              label={frontend.description}
              className="chip frontend-chip"
              align="left"
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
              align="left"
              key={capability.id}
            >
              {capability.label}
            </Tooltip>
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
