const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "of",
  "the",
  "to",
  "with",
]);

function separateCamelCase(value: string) {
  return value.replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2");
}

export function normalizeSearchText(value: string) {
  return separateCamelCase(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function searchTerms(value: string) {
  const terms = normalizeSearchText(value).split(" ").filter(Boolean);
  const meaningful = terms.filter((term) => !FUNCTION_WORDS.has(term));
  return meaningful.length > 0 ? meaningful : terms;
}

export function searchDocumentTerms(value: string) {
  const normalizedTerms = normalizeSearchText(value).split(" ").filter(Boolean);
  const compactTerms = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter(Boolean);
  return [...new Set([...normalizedTerms, ...compactTerms])];
}

export function searchClauses(value: string) {
  return value
    .split("+")
    .map((clause) => searchTerms(clause).join(" "))
    .filter(Boolean);
}

export function searchMeaning(value: string) {
  return searchClauses(value).join("+");
}

export function allowedEditDistance(term: string): 0 | 1 | 2 {
  if (term.length < 5) return 0;
  if (term.length < 8) return 1;
  return 2;
}
