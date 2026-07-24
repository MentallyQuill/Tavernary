const githubApi = "https://api.github.com";

async function defaultGithub(path, options = {}) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const query = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : "";
  const response = await fetch(`${githubApi}${path}${query}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub request failed: ${response.status}`);
  return response.json();
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
    typeof readme.content !== "string" ||
    readme.content.length === 0
  ) {
    return null;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.from(readme.content, "base64"))
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

export async function loadReadmeSource(record, snapshot, options = {}) {
  const description = repositoryDescription(snapshot);
  if (description) {
    return {
      repositoryDescription: description,
      readmeText: null,
      readmePath: null,
      readmeRef: null,
    };
  }

  if (!snapshot?.readme?.found) {
    return {
      repositoryDescription: null,
      readmeText: null,
      readmePath: null,
      readmeRef: null,
    };
  }

  const owner = snapshot.repository.owner;
  const name = snapshot.repository.name;
  const ref = snapshot.repository.default_branch;
  const github = options.github ?? defaultGithub;
  const readme = await github(`/repos/${owner}/${name}/readme`, { ref });
  const readmeText = decodeReadme(readme);
  if (!readmeText) {
    return {
      repositoryDescription: null,
      readmeText: null,
      readmePath: null,
      readmeRef: null,
    };
  }

  return {
    repositoryDescription: null,
    readmeText,
    readmePath: readme.path ?? snapshot.readme.path ?? null,
    readmeRef: snapshot.readme.ref ?? ref ?? null,
  };
}
