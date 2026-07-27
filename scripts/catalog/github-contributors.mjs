const githubApi = "https://api.github.com";

function nextLink(value) {
  if (!value) return null;
  for (const part of value.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function contributorError(response, requestCount) {
  const error = new Error(`GitHub contributors returned ${response.status}`);
  error.status = response.status;
  error.rateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.get("retry-after") !== null));
  error.systemic = response.status === 401 || error.rateLimited;
  error.requestCount = requestCount;
  return error;
}

function countedError(message, requestCount) {
  const error = new Error(message);
  error.requestCount = requestCount;
  return error;
}

function accountKey(login) {
  return login.toLocaleLowerCase("en");
}

function forkPullsUrl({ owner, name }, page, perPage) {
  return (
    `${githubApi}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
    `/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}&page=${page}`
  );
}

function safeForkPage(value, repository, requestCount) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw countedError(
      "GitHub fork contributors returned unsafe pagination",
      requestCount,
    );
  }
  const expectedPath =
    `/repos/${encodeURIComponent(repository.owner)}/` +
    `${encodeURIComponent(repository.name)}/pulls`;
  const page = Number(parsed.searchParams.get("page"));
  if (
    parsed.origin !== githubApi ||
    parsed.pathname.toLocaleLowerCase("en") !==
      expectedPath.toLocaleLowerCase("en") ||
    !Number.isInteger(page) ||
    page < 1
  ) {
    throw countedError(
      "GitHub fork contributors returned unsafe pagination",
      requestCount,
    );
  }
  return page;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "Tavernary-catalog-refresh",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function fetchRepositoryContributors({ owner, name }, options) {
  if (typeof options.token !== "string" || options.token.length === 0) {
    throw new Error("GitHub contributors authentication token is required");
  }
  const perPage = options.perPage ?? 100;
  let url =
    `${githubApi}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
    `/contributors?anon=0&per_page=${perPage}`;
  let requestCount = 0;
  const accounts = new Map();

  while (url) {
    requestCount += 1;
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: githubHeaders(options.token),
    });
    if (!response.ok) {
      throw contributorError(response, requestCount);
    }
    let page;
    try {
      page = await response.json();
    } catch {
      throw countedError(
        "GitHub contributors returned malformed JSON",
        requestCount,
      );
    }
    if (!Array.isArray(page)) {
      throw countedError(
        "GitHub contributors returned malformed JSON",
        requestCount,
      );
    }
    for (const account of page) {
      if (
        typeof account?.login !== "string" ||
        account.login.length === 0 ||
        typeof account?.type !== "string" ||
        account.type.length === 0
      ) {
        throw countedError(
          "GitHub contributors returned malformed account data",
          requestCount,
        );
      }
      const key = accountKey(account.login);
      if (!accounts.has(key)) {
        accounts.set(key, { login: account.login, type: account.type });
      }
    }
    url = nextLink(response.headers.get("link"));
  }

  return { accounts: [...accounts.values()], requestCount };
}

export async function fetchForkContributors({ owner, name }, options) {
  if (typeof options.token !== "string" || options.token.length === 0) {
    throw new Error("GitHub contributors authentication token is required");
  }
  const repository = { owner, name };
  const previous = options.previous ?? null;
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 2;
  const resumedScan = previous?.scan ?? null;
  const baselineCompletedAt = previous?.baselineCompletedAt ?? null;
  const cutoffAt = resumedScan?.cutoffAt ?? previous?.refreshedAt ?? null;
  const targetWatermark = resumedScan?.targetWatermark ?? options.now;
  let page = resumedScan?.nextPage ?? 1;
  let requestCount = 0;
  let stoppedAtWatermark = false;
  let nextPage = null;
  const accounts = new Map(
    (previous?.accounts ?? []).map((account) => [
      accountKey(account.login),
      account,
    ]),
  );

  for (let consumed = 0; consumed < maxPages; consumed += 1) {
    requestCount += 1;
    const response = await (options.fetchImpl ?? fetch)(
      forkPullsUrl(repository, page, perPage),
      { headers: githubHeaders(options.token) },
    );
    if (!response.ok) {
      throw contributorError(response, requestCount);
    }
    let rows;
    try {
      rows = await response.json();
    } catch {
      throw countedError(
        "GitHub fork contributors returned malformed JSON",
        requestCount,
      );
    }
    if (!Array.isArray(rows)) {
      throw countedError(
        "GitHub fork contributors returned malformed JSON",
        requestCount,
      );
    }

    for (const row of rows) {
      const updatedAt = new Date(row?.updated_at);
      if (
        typeof row?.updated_at !== "string" ||
        !Number.isFinite(updatedAt.getTime()) ||
        !(
          row?.merged_at === null ||
          (typeof row?.merged_at === "string" &&
            Number.isFinite(new Date(row.merged_at).getTime()))
        )
      ) {
        throw countedError(
          "GitHub fork contributors returned malformed pull-request data",
          requestCount,
        );
      }
      if (
        cutoffAt !== null &&
        updatedAt.getTime() <= new Date(cutoffAt).getTime()
      ) {
        stoppedAtWatermark = true;
        break;
      }
      if (row.merged_at === null) continue;
      if (
        typeof row.user?.login !== "string" ||
        row.user.login.length === 0 ||
        typeof row.user?.type !== "string" ||
        row.user.type.length === 0
      ) {
        throw countedError(
          "GitHub fork contributors returned malformed account data",
          requestCount,
        );
      }
      const key = accountKey(row.user.login);
      if (!accounts.has(key)) {
        accounts.set(key, {
          login: row.user.login,
          type: row.user.type,
        });
      }
    }

    if (stoppedAtWatermark) {
      nextPage = null;
      break;
    }
    nextPage = safeForkPage(
      nextLink(response.headers.get("link")),
      repository,
      requestCount,
    );
    if (nextPage === null) break;
    page = nextPage;
  }

  const complete = stoppedAtWatermark || nextPage === null;
  const completedBaselineAt =
    baselineCompletedAt ??
    (complete && cutoffAt === null ? targetWatermark : null);

  return {
    accounts: [...accounts.values()],
    requestCount,
    baselineCompletedAt: completedBaselineAt,
    refreshedAt: complete ? targetWatermark : (previous?.refreshedAt ?? null),
    scan: complete
      ? null
      : {
          nextPage,
          cutoffAt,
          targetWatermark,
        },
  };
}
