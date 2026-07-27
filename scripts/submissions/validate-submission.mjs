import { sourceDuplicateKeys } from "./source-identity.mjs";

function canonicalSource(sourceUrl) {
  const parsed = new URL(sourceUrl);
  const pathname = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
  return `${parsed.hostname.toLowerCase()}${pathname}`;
}

function validateResolvedSubmission({
  projectType,
  identity,
  existingIdentities,
}) {
  const errors = [];
  if (projectType === "extension" && identity.kind !== "github") {
    errors.push("Extensions require a public GitHub repository.");
  }
  if (
    projectType === "frontend" &&
    !["github", "external"].includes(identity.kind)
  ) {
    errors.push("Frontends require a public source repository.");
  }
  const existingKeys = new Set(
    existingIdentities.flatMap((candidate) => sourceDuplicateKeys(candidate)),
  );
  const duplicate = sourceDuplicateKeys(identity).some((key) =>
    existingKeys.has(key),
  );
  return { duplicate, errors };
}

export function validateSubmission(input) {
  if (input?.identity) return validateResolvedSubmission(input);
  const { kind, sourceUrl, existingSources } = input;
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

  if (kind === "Extension" && !githubRepository) {
    errors.push("Extensions require a public GitHub repository.");
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
