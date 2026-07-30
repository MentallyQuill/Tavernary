export const MAX_PREFILL_URL_LENGTH = 7_000;

export interface GitHubHandoffInput {
  formUrl: string | URL;
  template: string;
  manifestFieldId: string;
  serializedManifest: string;
  prefills: readonly (readonly [fieldId: string, value: string])[];
  pasteInstruction: string;
  copyPrompt: string;
}

export interface GitHubHandoffResult {
  mode: "prefilled" | "clipboard";
  url: string;
}

export class GitHubHandoffError extends Error {
  readonly url: string | null;

  constructor(message: string, url: string | null) {
    super(message);
    this.name = "GitHubHandoffError";
    this.url = url;
  }
}

function recoveryTarget(input: GitHubHandoffInput) {
  const target = new URL(input.formUrl.toString());
  target.search = "";
  target.searchParams.set("template", input.template);
  target.searchParams.set(input.manifestFieldId, input.pasteInstruction);
  return target;
}

export function prepareGitHubReview(
  input: GitHubHandoffInput,
): GitHubHandoffResult {
  const target = new URL(input.formUrl.toString());
  target.searchParams.set("template", input.template);
  for (const [fieldId, value] of input.prefills) {
    target.searchParams.set(fieldId, value);
  }
  target.searchParams.set(input.manifestFieldId, input.serializedManifest);

  if (target.toString().length <= MAX_PREFILL_URL_LENGTH) {
    return { mode: "prefilled", url: target.toString() };
  }

  const recovery = recoveryTarget(input);
  for (const [fieldId, value] of input.prefills) {
    recovery.searchParams.set(fieldId, value);
    if (recovery.toString().length > MAX_PREFILL_URL_LENGTH) {
      recovery.searchParams.delete(fieldId);
    }
  }
  if (recovery.toString().length > MAX_PREFILL_URL_LENGTH) {
    throw new GitHubHandoffError(
      "GitHub review URL exceeds the safe handoff limit.",
      null,
    );
  }
  return { mode: "clipboard", url: recovery.toString() };
}

function openReview(prepared: GitHubHandoffResult): GitHubHandoffResult {
  if (window.open(prepared.url, "_blank", "noopener,noreferrer") === null) {
    throw new GitHubHandoffError(
      "GitHub review could not be opened.",
      prepared.url,
    );
  }
  return prepared;
}

export async function openGitHubReview(
  input: GitHubHandoffInput,
): Promise<GitHubHandoffResult> {
  const prepared = prepareGitHubReview(input);
  if (prepared.mode === "clipboard") {
    try {
      await navigator.clipboard.writeText(input.serializedManifest);
    } catch {
      window.prompt(input.copyPrompt, input.serializedManifest);
    }
  }
  return openReview(prepared);
}

export async function copyGitHubReviewUrl(
  input: GitHubHandoffInput,
): Promise<GitHubHandoffResult> {
  const prepared = prepareGitHubReview(input);
  if (prepared.mode === "clipboard") {
    throw new GitHubHandoffError(
      "This submission is too large to fit in a single URL. Use Continue on GitHub so Tavernary can copy the manifest separately.",
      null,
    );
  }
  try {
    await navigator.clipboard.writeText(prepared.url);
  } catch {
    throw new GitHubHandoffError(
      "Tavernary could not copy the GitHub form URL. Copy it below instead.",
      prepared.url,
    );
  }
  return prepared;
}
