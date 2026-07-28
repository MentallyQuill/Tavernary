import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import { GitHubRepositoryProvider } from "../catalog/github-repository-provider.mjs";
import { snapshotFromObservation } from "../catalog/repository-snapshot.mjs";
import { ensureForkParentSubmission } from "./fork-dependency.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function candidateManifest(children, parentRepository, parentName) {
  const first = children[0];
  const frontends = uniqueSorted(
    children.flatMap((child) => child.frontends ?? []),
  );
  const manifest = {
    schema_version: first.kind === "preset" ? 2 : 1,
    project_type: first.kind,
    source_url: `https://github.com/${parentRepository}`,
    name: parentName,
    description: null,
    frontends: { known_ids: frontends, other: [] },
    frontend_independent: first.kind === "preset" && frontends.length === 0,
    additional_context:
      "Classification was inherited from existing catalog forks for maintainer review.",
  };
  if (first.kind === "preset") {
    manifest.preset_compatibility = {
      model_families: {
        known_ids: uniqueSorted(
          children.flatMap((child) => child.model_families ?? []),
        ),
        other: [],
      },
      completion_formats: uniqueSorted(
        children.flatMap((child) => child.completion_formats ?? []),
      ),
    };
  }
  return manifest;
}

export function planForkDependencyBackfill({ projects, snapshots }) {
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const knownRepositoryIds = new Set(
    projects.flatMap((project) =>
      project.source?.type === "github" &&
      Number.isInteger(project.source.repository_id) &&
      project.source.repository_id > 0
        ? [project.source.repository_id]
        : [],
    ),
  );
  const groups = new Map();

  for (const snapshot of snapshots) {
    const parent = snapshot.repository?.parent;
    const child = projectsById.get(snapshot.project_id);
    if (
      snapshot.repository?.fork !== true ||
      !parent ||
      !child ||
      child.visibility !== "published" ||
      child.refresh_policy !== "automatic" ||
      child.source?.type !== "github" ||
      knownRepositoryIds.has(parent.id)
    ) {
      continue;
    }
    const repository = `${parent.owner}/${parent.name}`;
    const existing = groups.get(parent.id);
    if (
      existing &&
      (existing.parentName !== parent.name ||
        existing.parentRepository !== repository)
    ) {
      throw new Error(
        `Conflicting identities for parent repository ID ${parent.id}.`,
      );
    }
    if (existing) {
      existing.children.push(child);
      existing.dependentRepositoryIds.push(snapshot.repository.id);
    } else {
      groups.set(parent.id, {
        parentRepositoryId: parent.id,
        parentName: parent.name,
        parentRepository: repository,
        children: [child],
        dependentRepositoryIds: [snapshot.repository.id],
      });
    }
  }

  return [...groups.values()]
    .sort((left, right) => left.parentRepositoryId - right.parentRepositoryId)
    .map((group) => {
      const kinds = new Set(group.children.map(({ kind }) => kind));
      if (kinds.size !== 1) {
        throw new Error(
          `Parent repository ID ${group.parentRepositoryId} has incompatible child kinds.`,
        );
      }
      const children = [...group.children].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      return {
        parentRepositoryId: group.parentRepositoryId,
        parentName: group.parentName,
        parentRepository: group.parentRepository,
        dependentProjectIds: children.map(({ id }) => id),
        dependentRepositoryIds: [...group.dependentRepositoryIds].sort(
          (left, right) => left - right,
        ),
        manifest: candidateManifest(
          children,
          group.parentRepository,
          group.parentName,
        ),
      };
    });
}

export async function observeForkBackfillParents({
  projects,
  snapshots,
  token,
  observe,
  now = new Date().toISOString(),
}) {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const records = projects
    .filter(
      (project) =>
        project.visibility === "published" &&
        project.refresh_policy === "automatic" &&
        project.source?.type === "github" &&
        snapshotsById.get(project.id)?.repository?.fork === true,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const provider = new GitHubRepositoryProvider({
    ...(observe ? { observeRepositories: observe } : {}),
    token,
  });
  const observation = await provider.observe(records);
  const updatedById = new Map();
  for (const item of observation.observations) {
    const previous = snapshotsById.get(item.projectId);
    if (!previous) continue;
    updatedById.set(
      item.projectId,
      snapshotFromObservation({
        provider: "github",
        projectId: item.projectId,
        observation: item,
        previous,
        now,
        contributors: previous.contributors,
      }),
    );
  }
  const projectedSnapshots = snapshots.map(
    (snapshot) => updatedById.get(snapshot.project_id) ?? snapshot,
  );
  return {
    candidates: planForkDependencyBackfill({
      projects,
      snapshots: projectedSnapshots,
    }),
    updatedSnapshots: [...updatedById.values()].sort((left, right) =>
      left.project_id.localeCompare(right.project_id),
    ),
  };
}

export async function applyForkDependencyBackfill({
  candidates,
  repository,
  request,
  apply,
  updatedSnapshotPaths = [],
}) {
  const report = {
    mode: apply ? "apply" : "dry-run",
    candidates,
    createdIssueNumbers: [],
    reusedIssueNumbers: [],
    terminalIssueNumbers: [],
    updatedSnapshotPaths,
  };
  if (!apply) return report;

  for (const candidate of candidates) {
    const result = await ensureForkParentSubmission({
      repository,
      dependency: {
        repositoryId: candidate.parentRepositoryId,
        name: candidate.parentName,
        repository: candidate.parentRepository,
        canonicalUrl: `https://github.com/${candidate.parentRepository}`,
        issueNumber: null,
      },
      dependentProjectIds: candidate.dependentProjectIds,
      manifest: candidate.manifest,
      ancestryRepositoryIds: [candidate.dependentRepositoryIds[0]],
      request,
    });
    if (result.state === "created") {
      report.createdIssueNumbers.push(result.issueNumber);
    } else if (result.state === "open") {
      report.reusedIssueNumbers.push(result.issueNumber);
    } else {
      report.terminalIssueNumbers.push(result.issueNumber);
    }
    if (result.dispatchTriage) {
      await request(
        `/repos/${repository}/actions/workflows/triage-submission.yml/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({
            ref: "main",
            inputs: { issue_number: String(result.issueNumber) },
          }),
        },
      );
    }
  }
  return report;
}

async function readJsonDirectory(path) {
  const directory = resolve(rootDirectory, path);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-fork-backfill",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function parseArguments(argv) {
  for (const argument of argv) {
    if (argument !== "--apply") {
      throw new Error(`Unknown fork backfill argument: ${argument}`);
    }
  }
  return { apply: argv.includes("--apply") };
}

async function main() {
  const { apply } = parseArguments(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  if (!token) {
    throw new Error("GITHUB_TOKEN is required for fork dependency backfill.");
  }
  if (apply && !repository) {
    throw new Error("GITHUB_REPOSITORY is required with --apply.");
  }

  const [projects, snapshots] = await Promise.all([
    readJsonDirectory("data/registry/projects"),
    readJsonDirectory("data/snapshots/github"),
  ]);
  const observation = await observeForkBackfillParents({
    projects,
    snapshots,
    token,
  });
  const updatedSnapshotPaths = observation.updatedSnapshots.map(
    ({ project_id }) => `data/snapshots/github/${project_id}.json`,
  );

  if (apply) {
    for (const snapshot of observation.updatedSnapshots) {
      const path = resolve(
        rootDirectory,
        `data/snapshots/github/${snapshot.project_id}.json`,
      );
      const temporaryPath = `${path}.tmp`;
      await writeFile(
        temporaryPath,
        await format(JSON.stringify(snapshot), {
          parser: "json",
          filepath: path,
        }),
      );
      await rename(temporaryPath, path);
    }
  }

  const report = await applyForkDependencyBackfill({
    candidates: observation.candidates,
    repository,
    request: github,
    apply,
    updatedSnapshotPaths,
  });
  console.log(JSON.stringify(report, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
