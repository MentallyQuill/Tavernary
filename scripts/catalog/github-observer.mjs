const graphqlUrl = "https://api.github.com/graphql";
const defaultLogger = {
  log() {},
  error() {},
};

function repositorySelection(index) {
  return `
    r${index}: repository(owner: $owner${index}, name: $name${index}) {
      databaseId
      name
      nameWithOwner
      url
      description
      createdAt
      diskUsage
      isArchived
      isFork
      parent {
        databaseId
        name
        nameWithOwner
        url
      }
      forkCount
      stargazerCount
      watchers { totalCount }
      licenseInfo { spdxId }
      latestRelease { publishedAt }
      defaultBranchRef {
        name
        target {
          ... on Commit { oid committedDate }
        }
      }
    }`;
}

function batchQuery(count) {
  const variables = Array.from(
    { length: count },
    (_, index) => `$owner${index}: String!, $name${index}: String!`,
  ).join(", ");
  const selections = Array.from({ length: count }, (_, index) =>
    repositorySelection(index),
  ).join("\n");
  return `query ObserveRepositories(${variables}) {
    ${selections}
    rateLimit { cost remaining resetAt }
  }`;
}

function parseRepositoryName(record) {
  const repository = record.repository;
  if (typeof repository !== "string") {
    throw new Error(`${record.id}: GitHub repository is required`);
  }
  const [owner, name, extra] = repository.split("/");
  if (!owner || !name || extra) {
    throw new Error(`${record.id}: invalid GitHub repository ${repository}`);
  }
  return { owner, name };
}

function isoTimestamp(value, field) {
  const date = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(date.getTime())) {
    throw new Error(`GitHub GraphQL returned malformed ${field}`);
  }
  return date.toISOString();
}

function validRateLimit(rateLimit) {
  return (
    rateLimit &&
    Number.isInteger(rateLimit.cost) &&
    rateLimit.cost >= 0 &&
    Number.isInteger(rateLimit.remaining) &&
    rateLimit.remaining >= 0 &&
    typeof rateLimit.resetAt === "string" &&
    Number.isFinite(new Date(rateLimit.resetAt).getTime())
  );
}

function retryDelay(response) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const timestamp = new Date(retryAfter).getTime();
    if (Number.isFinite(timestamp)) {
      return Math.max(0, timestamp - Date.now());
    }
  }
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  return Number.isFinite(resetSeconds)
    ? Math.max(0, resetSeconds * 1000 - Date.now())
    : 0;
}

async function wait(milliseconds) {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBatch(body, options) {
  const { fetchImpl, logger, maxRetries, token } = options;
  let requestCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response;
    try {
      requestCount += 1;
      response = await fetchImpl(graphqlUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "Tavernary-catalog-refresh",
        },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt < maxRetries) {
        logger.log("Retrying GitHub GraphQL request after transport failure");
        continue;
      }
      throw new Error("GitHub GraphQL transport request failed");
    }

    const rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.get("retry-after") !== null));
    if (rateLimited && attempt < maxRetries) {
      logger.log("Retrying GitHub GraphQL request after rate limiting");
      await wait(retryDelay(response));
      continue;
    }
    if (rateLimited) {
      throw new Error("GitHub GraphQL rate budget is exhausted");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub GraphQL authentication failed");
    }
    if (response.status >= 500 && attempt < maxRetries) {
      logger.log(
        `Retrying GitHub GraphQL request after status ${response.status}`,
      );
      await wait(retryDelay(response));
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `GitHub GraphQL request failed with status ${response.status}`,
      );
    }

    try {
      return { payload: await response.json(), requestCount };
    } catch {
      throw new Error("GitHub GraphQL returned malformed JSON");
    }
  }

  throw new Error("GitHub GraphQL retry limit reached");
}

function parseObservation(record, repository) {
  if (!repository || typeof repository !== "object") {
    return {
      failure: {
        sourceId: record.id,
        kind: "unavailable",
        message: "Repository is unavailable",
      },
    };
  }
  if (
    record.repository_id !== null &&
    repository.databaseId !== record.repository_id
  ) {
    return {
      failure: {
        sourceId: record.id,
        kind: "identity-change",
        message: "Repository identity changed",
      },
    };
  }

  const branch = repository.defaultBranchRef;
  const head = branch?.target;
  if (
    !branch ||
    typeof branch.name !== "string" ||
    !head ||
    typeof head.oid !== "string" ||
    !/^[0-9a-f]{40}$/i.test(head.oid)
  ) {
    return {
      failure: {
        sourceId: record.id,
        kind: "missing-default-branch",
        message: "Repository has no default branch commit",
      },
    };
  }

  const [owner, name, extra] =
    typeof repository.nameWithOwner === "string"
      ? repository.nameWithOwner.split("/")
      : [];
  if (
    !owner ||
    !name ||
    extra ||
    !Number.isInteger(repository.databaseId) ||
    repository.databaseId <= 0 ||
    typeof repository.name !== "string" ||
    typeof repository.url !== "string" ||
    !(
      repository.description === null ||
      typeof repository.description === "string"
    ) ||
    !Number.isInteger(repository.diskUsage) ||
    repository.diskUsage < 0 ||
    typeof repository.isArchived !== "boolean" ||
    typeof repository.isFork !== "boolean" ||
    !Number.isInteger(repository.forkCount) ||
    !Number.isInteger(repository.stargazerCount) ||
    !Number.isInteger(repository.watchers?.totalCount)
  ) {
    throw new Error("GitHub GraphQL returned malformed repository data");
  }
  const parent = repository.parent;
  let parentObservation = null;
  if (parent !== null && parent !== undefined) {
    const [parentOwner, parentName, parentExtra] =
      typeof parent.nameWithOwner === "string"
        ? parent.nameWithOwner.split("/")
        : [];
    if (
      repository.isFork !== true ||
      !parentOwner ||
      !parentName ||
      parentExtra ||
      !Number.isInteger(parent.databaseId) ||
      parent.databaseId <= 0 ||
      parent.databaseId === repository.databaseId ||
      typeof parent.name !== "string" ||
      parent.name !== parentName ||
      typeof parent.url !== "string"
    ) {
      throw new Error("GitHub GraphQL returned malformed repository data");
    }
    parentObservation = {
      id: parent.databaseId,
      owner: parentOwner,
      name: parent.name,
      url: parent.url,
    };
  }

  return {
    observation: {
      sourceId: record.id,
      repository: {
        id: repository.databaseId,
        owner,
        name: repository.name,
        url: repository.url,
        description: repository.description,
        defaultBranch: branch.name,
        headSha: head.oid.toLowerCase(),
        headCommittedAt: isoTimestamp(
          head.committedDate,
          "head commit timestamp",
        ),
        archived: repository.isArchived,
        fork: repository.isFork,
        parent: parentObservation,
        createdAt: isoTimestamp(repository.createdAt, "repository timestamp"),
        sizeKb: repository.diskUsage,
      },
      community: {
        stargazersCount: repository.stargazerCount,
        forksCount: repository.forkCount,
        subscribersCount: repository.watchers.totalCount,
      },
      latestReleaseAt:
        repository.latestRelease === null
          ? null
          : isoTimestamp(
              repository.latestRelease?.publishedAt,
              "release timestamp",
            ),
      coarseLicenseSpdxId:
        typeof repository.licenseInfo?.spdxId === "string"
          ? repository.licenseInfo.spdxId
          : null,
    },
  };
}

export async function observeRepositories(records, options = {}) {
  const token = options.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GitHub GraphQL authentication token is required");
  }
  const batchSize = options.batchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error("GitHub GraphQL batch size must be between 1 and 25");
  }
  const maxRetries = options.maxRetries ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new Error("GitHub GraphQL maxRetries must be between 0 and 5");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? defaultLogger;
  const observations = [];
  const failures = [];
  let requestCount = 0;
  let pointCost = 0;
  let remainingPoints = null;

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const variables = {};
    batch.forEach((record, index) => {
      const repository = parseRepositoryName(record);
      variables[`owner${index}`] = repository.owner;
      variables[`name${index}`] = repository.name;
    });
    const request = await requestBatch(
      { query: batchQuery(batch.length), variables },
      { fetchImpl, logger, maxRetries, token },
    );
    const result = request.payload;
    requestCount += request.requestCount;

    if (!result || typeof result !== "object" || !result.data) {
      throw new Error("GitHub GraphQL returned malformed root data");
    }
    if (!validRateLimit(result.data.rateLimit)) {
      throw new Error("GitHub GraphQL returned malformed rate-limit data");
    }
    pointCost += result.data.rateLimit.cost;
    remainingPoints = result.data.rateLimit.remaining;
    logger.log(
      `GitHub GraphQL batch ${Math.floor(start / batchSize) + 1}: ${batch.length} repositories, cost ${result.data.rateLimit.cost}, remaining ${remainingPoints}`,
    );
    if (remainingPoints <= 0) {
      throw new Error("GitHub GraphQL rate budget is exhausted");
    }

    const aliasErrors = new Set();
    for (const error of result.errors ?? []) {
      const alias = Array.isArray(error?.path) ? error.path[0] : null;
      if (typeof alias !== "string" || !/^r\d+$/.test(alias)) {
        throw new Error("GitHub GraphQL returned a systemic query error");
      }
      aliasErrors.add(alias);
    }

    batch.forEach((record, index) => {
      const alias = `r${index}`;
      if (aliasErrors.has(alias)) {
        failures.push({
          sourceId: record.id,
          kind: "unavailable",
          message: "Repository is unavailable",
        });
        return;
      }
      const parsed = parseObservation(record, result.data[alias]);
      if (parsed.failure) failures.push(parsed.failure);
      if (parsed.observation) observations.push(parsed.observation);
    });
  }

  return {
    observations,
    failures,
    usage: {
      requestCount,
      pointCost,
      remainingPoints,
    },
  };
}
