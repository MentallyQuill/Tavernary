import { serializeHelpManifest } from "./help-manifest.mjs";

const MAX_PREFILL_URL_LENGTH = 7_000;

export interface HelpHandoffInput {
  formUrl: string | URL;
  template: string;
  manifest: object;
  manifestFieldId: "help-manifest" | "owner-request-manifest";
  prefills: Array<readonly [fieldId: string, value: string]>;
  pasteInstruction: string;
}

export class HelpHandoffError extends Error {
  readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = "HelpHandoffError";
    this.url = url;
  }
}

function openOrThrow(target: URL) {
  const url = target.toString();
  if (window.open(url, "_blank", "noopener,noreferrer") === null) {
    throw new HelpHandoffError("GitHub issue form could not be opened.", url);
  }
}

function fallbackTarget(input: HelpHandoffInput) {
  const target = new URL(input.formUrl.toString());
  target.search = "";
  target.searchParams.set("template", input.template);
  target.searchParams.set(input.manifestFieldId, input.pasteInstruction);
  return target;
}

export async function openHelpRequest(
  input: HelpHandoffInput,
): Promise<"prefilled" | "clipboard"> {
  const serializedManifest = serializeHelpManifest(input.manifest);
  const target = new URL(input.formUrl.toString());
  target.searchParams.set("template", input.template);
  for (const [fieldId, value] of input.prefills) {
    target.searchParams.set(fieldId, value);
  }
  target.searchParams.set(input.manifestFieldId, serializedManifest);

  if (target.toString().length <= MAX_PREFILL_URL_LENGTH) {
    openOrThrow(target);
    return "prefilled";
  }

  try {
    await navigator.clipboard.writeText(serializedManifest);
  } catch {
    window.prompt(input.pasteInstruction, serializedManifest);
  }

  const fallback = fallbackTarget(input);
  for (const [fieldId, value] of input.prefills) {
    fallback.searchParams.set(fieldId, value);
    if (fallback.toString().length > MAX_PREFILL_URL_LENGTH) {
      fallback.searchParams.delete(fieldId);
    }
  }
  if (fallback.toString().length > MAX_PREFILL_URL_LENGTH) {
    throw new Error("GitHub issue form URL exceeds the safe handoff limit.");
  }
  openOrThrow(fallback);
  return "clipboard";
}
