const defaultMaxCharacters = 8_000;
const usefulHeadings =
  /^(?:overview|about|purpose|features?|usage|what it does)$/iu;

function headingName(line) {
  const match = /^#{2,6}\s+(.+?)\s*#*\s*$/u.exec(line.trim());
  return match?.[1]?.trim() ?? null;
}

function removeNoise(raw) {
  return raw
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, "")
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/gu, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/<img\b[^>]*>/giu, "")
    .replace(
      /^.*(?:back to top|table of contents|^\s*(?:home|documentation)\s*$).*$/gimu,
      "",
    );
}

function selectDescriptiveSections(text) {
  const lines = text.split("\n");
  const selected = [];
  let encounteredSection = false;
  let keepSection = true;

  for (const line of lines) {
    const name = headingName(line);
    if (name !== null) {
      encounteredSection = true;
      keepSection = usefulHeadings.test(name);
      if (keepSection) selected.push(line);
      continue;
    }

    if (!encounteredSection || keepSection) selected.push(line);
  }

  return selected.join("\n");
}

export function prepareReadmeText(raw, options = {}) {
  if (typeof raw !== "string") return null;
  const maximum = options.maxCharacters ?? defaultMaxCharacters;
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("README maximum must be a positive integer");
  }

  const selected = selectDescriptiveSections(removeNoise(raw));
  const compact = selected
    .replace(/[ \t]+$/gmu, "")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return compact.length === 0 ? null : compact.slice(0, maximum);
}
