function canonicalSource(sourceUrl) {
  const parsed = new URL(sourceUrl);
  const pathname = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
  return `${parsed.hostname.toLowerCase()}${pathname}`;
}

export function validateSubmission({ kind, sourceUrl, existingSources }) {
  const errors = [];
  let parsed;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    return {
      labels: ["needs-information"],
      errors: ["Canonical source URL must be a valid HTTPS URL."],
    };
  }

  if (parsed.protocol !== "https:") {
    errors.push("Canonical source URL must be a valid HTTPS URL.");
  }

  const path = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  const parts = path.split("/").filter(Boolean);
  const githubRepository =
    parsed.hostname.toLowerCase() === "github.com" && parts.length === 2;

  if ((kind === "Frontend" || kind === "Extension") && !githubRepository) {
    errors.push("Frontends and Extensions require a public GitHub repository.");
  }

  const canonical = canonicalSource(sourceUrl);
  const duplicate = existingSources.some((source) => {
    try {
      return canonicalSource(source) === canonical;
    } catch {
      return false;
    }
  });

  if (duplicate) {
    return { labels: ["duplicate-candidate"], errors };
  }

  return {
    labels: [errors.length ? "needs-information" : "needs-maintainer-review"],
    errors,
  };
}
