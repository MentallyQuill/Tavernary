export const severeLanguageTerms = Object.freeze([
  "chink",
  "chinks",
  "coon",
  "coons",
  "dyke",
  "dykes",
  "fag",
  "faggot",
  "faggots",
  "fags",
  "gook",
  "gooks",
  "kike",
  "kikes",
  "mongoloid",
  "nigga",
  "niggas",
  "nigger",
  "niggers",
  "paki",
  "pakis",
  "raghead",
  "ragheads",
  "retard",
  "retards",
  "shemale",
  "shemales",
  "spic",
  "spics",
  "towelhead",
  "towelheads",
  "trannies",
  "tranny",
  "wetback",
  "wetbacks",
]);

const substitutions = Object.freeze({
  0: "o",
  1: "i",
  3: "e",
  4: "a",
  5: "s",
  7: "t",
  "@": "a",
  $: "s",
});

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeForPolicy(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457@$]/gu, (character) => substitutions[character]);
}

const separator = String.raw`[\p{P}\p{S}\s_]*`;
const termPatterns = severeLanguageTerms.map((term) => {
  const body = [...term].map(escapePattern).join(separator);
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`, "u");
});

export function containsDisallowedKitLanguage(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const normalized = normalizeForPolicy(value);
  return termPatterns.some((pattern) => pattern.test(normalized));
}
