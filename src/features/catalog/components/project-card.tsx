import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "../catalog-types";
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
        {project.activity.activeWeeks12 !== null &&
        project.activity.twoWeekBars ? (
          <span className="development">
            <Tooltip
              id={activityId}
              label={`Active ${project.activity.activeWeeks12} of the last 12 weeks`}
              className="activity-score"
            >
              <b>{project.activity.activeWeeks12}/12</b>
              <ActivitySparkline bars={project.activity.twoWeekBars} />
            </Tooltip>
            <span
              className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
            >
              {relativeTime(project.activity.latestMeaningfulCommitAt, now)}
            </span>
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
            <span className="repository-size">
              {formatSize(project.repositorySizeKb)}
            </span>
          </span>
        ) : (
          <span className="development preset-development">
            {project.preset?.version ? (
              <b>{formatVersion(project.preset.version)}</b>
            ) : (
              <b>Preset</b>
            )}
            <span>
              {project.preset?.publishedAt
                ? `Published ${relativeTime(project.preset.publishedAt, now)}`
                : "Source linked"}
            </span>
            <span>
              {formatBytes(project.preset?.artifactSizeBytes ?? null)}
            </span>
          </span>
        )}
      </div>

      <h2>{project.name}</h2>
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
