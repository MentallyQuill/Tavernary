import Ajv from "ajv";

import { prepareReadmeText } from "./readme-preparation.mjs";

const githubApi = "https://api.github.com";

const readinessMessages = {
  "missing-snapshot": "Repository snapshot is missing.",
  "invalid-snapshot": "Repository snapshot is invalid.",
  "project-mismatch": "Repository snapshot belongs to another project.",
  "unhealthy-source": "Snapshot source is unavailable.",
  "stale-source": "Repository snapshot is stale.",
  "missing-permanent-identity": "Permanent repository identity is missing.",
  "repository-mismatch": "Repository snapshot path does not match the record.",
  "identity-mismatch":
    "Repository snapshot identity does not match the record.",
};

class GithubRequestError extends Error {
  constructor(status) {
    super(`GitHub README request failed with status ${status}`);
    this.status = status;
  }
}

async function defaultGithub(path, options = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new GithubRequestError(401);
  }
  const query = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : "";
  const response = await fetch(`${githubApi}${path}${query}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "Tavernary-catalog-enrichment",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubRequestError(response.status);
  try {
    return await response.json();
  } catch {
    throw new GithubRequestError(502);
  }
}

function repositoryDescription(snapshot) {
  const description = snapshot?.repository?.description;
  return typeof description === "string" && description.trim().length > 0
    ? description.trim()
    : null;
}

function decodeReadme(readme) {
  if (
    !readme ||
    readme.encoding !== "base64" ||
    typeof readme.content !== "string"
  ) {
    return null;
  }
  const encoded = readme.content.replace(/\s/gu, "");
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  ) {
    return null;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.from(encoded, "base64"))
      .replace(/^\uFEFF/u, "")
      .replace(/\r\n?/gu, "\n")
      .trim();
    if (
      decoded.length === 0 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(decoded)
    ) {
      return null;
    }

    const meaningfulLines = decoded.split("\n").filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !/^!\[[^\]]*\]\([^)]*\)$/u.test(trimmed) &&
        !/^<img\b[^>]*>$/iu.test(trimmed) &&
        !/^<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>$/iu.test(trimmed)
      );
    });
    return meaningfulLines.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function notReady(reasonCode) {
  return {
    status: "source-not-ready",
    reasonCode,
    message: readinessMessages[reasonCode],
  };
}

export function createSnapshotValidator(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
  });
  ajv.addFormat(
    "date-time",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u,
  );
  return ajv.compile(schema);
}

export function assessSourceReadiness(record, snapshot, validateSnapshot) {
  if (!snapshot) return notReady("missing-snapshot");
  if (!validateSnapshot(snapshot)) return notReady("invalid-snapshot");
  if (snapshot.project_id !== record.id) return notReady("project-mismatch");
  if (snapshot.source_health !== "healthy") return notReady("unhealthy-source");
  if (snapshot.stale_since !== null) return notReady("stale-source");
  if (record.source?.repository_id == null)
    return notReady("missing-permanent-identity");

  const expected = record.source?.repository?.toLowerCase();
  const received =
    `${snapshot.repository.owner}/${snapshot.repository.name}`.toLowerCase();
  if (expected !== received) return notReady("repository-mismatch");
  if (record.source.repository_id !== snapshot.repository.id)
    return notReady("identity-mismatch");

  return { status: "ready", snapshot };
}

function readmeFailure(error) {
  const status = Number(error?.status);
  if (status === 401 || status === 403) {
    return {
      status: "failed",
      reasonCode: "readme-authentication-failed",
      message: "GitHub README authentication is unavailable.",
    };
  }
  if (status === 429) {
    return {
      status: "failed",
      reasonCode: "readme-rate-limited",
      message: "GitHub README request was rate limited.",
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      status: "failed",
      reasonCode: "readme-server-error",
      message: "GitHub README service is unavailable.",
    };
  }
  return {
    status: "failed",
    reasonCode: "readme-fetch-failed",
    message: "GitHub README request failed.",
  };
}

export async function loadReadmeSource(record, snapshot, options = {}) {
  const validateSnapshot =
    options.validateSnapshot ??
    ((value) => value?.schema_version === 2 && value?.repository);
  const readiness = assessSourceReadiness(record, snapshot, validateSnapshot);
  if (readiness.status !== "ready") return readiness;

  const { repository } = snapshot;
  const common = {
    repositoryId: repository.id,
    headSha: repository.head_sha,
  };
  const description = repositoryDescription(snapshot);
  if (description) {
    return {
      status: "ready",
      sourceKind: "description",
      text: description,
      repositoryDescription: description,
      readmeText: null,
      readmePath: null,
      readmeRef: null,
      ...common,
    };
  }

  const github = options.github ?? defaultGithub;
  let readme;
  try {
    readme = await github(
      `/repos/${repository.owner}/${repository.name}/readme`,
      { ref: repository.head_sha },
    );
  } catch (error) {
    return readmeFailure(error);
  }

  if (readme === null) {
    return {
      status: "fallback",
      sourceKind: "confirmed-fallback",
      readmePath: null,
      readmeRef: repository.head_sha,
      ...common,
    };
  }

  const decoded = decodeReadme(readme);
  const readmeText = decoded === null ? null : prepareReadmeText(decoded);
  if (!readmeText) {
    return {
      status: "failed",
      reasonCode: "readme-unusable",
      message: "GitHub README content is unusable.",
    };
  }

  return {
    status: "ready",
    sourceKind: "readme",
    text: readmeText,
    repositoryDescription: null,
    readmeText,
    readmePath: typeof readme.path === "string" ? readme.path : null,
    readmeRef: repository.head_sha,
    ...common,
  };
}
