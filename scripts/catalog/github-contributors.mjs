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
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "Tavernary-catalog-refresh",
        "X-GitHub-Api-Version": "2022-11-28",
      },
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
      const key = account.login.toLocaleLowerCase("en");
      if (!accounts.has(key)) {
        accounts.set(key, { login: account.login, type: account.type });
      }
    }
    url = nextLink(response.headers.get("link"));
  }

  return { accounts: [...accounts.values()], requestCount };
}
