import MiniSearch, { type SearchResult } from "minisearch";

import {
  allowedEditDistance,
  normalizeSearchText,
  searchDocumentTerms,
  searchMeaning,
  searchTerms,
} from "./search-normalization";
import {
  SEARCH_FIELD_NAMES,
  type CatalogSearchDocument,
  type CatalogSearchIndex,
  type CatalogSearchMatch,
  type CatalogSearchResults,
  type SearchEvidence,
  type SearchFieldName,
  type SearchMatchKind,
} from "./search-types";

const FIELD_BOOST: Record<SearchFieldName, number> = {
  title: 12,
  aliases: 10,
  source: 8,
  summary: 4,
  kind: 5,
  primaryFunction: 5,
  tags: 5,
  frontends: 3,
  compatibility: 3,
  maintainers: 2,
  relationships: 2,
};

const EVIDENCE_FIELD_PRIORITY: SearchFieldName[] = [
  "title",
  "aliases",
  "maintainers",
  "source",
  "summary",
  "kind",
  "primaryFunction",
  "tags",
  "frontends",
  "compatibility",
  "relationships",
];

interface TermMatch {
  kind: SearchMatchKind;
  matchedTerm: string;
  queryTerm: string;
}

function documentText(document: CatalogSearchDocument) {
  return SEARCH_FIELD_NAMES.flatMap((field) => document[field]).join(" ");
}

function tokenSet(value: string) {
  return new Set(searchDocumentTerms(value));
}

function uniqueTerms(value: string) {
  return [...new Set(searchTerms(value))];
}

function authorityTier(document: CatalogSearchDocument, query: string) {
  const title = normalizeSearchText(document.title.join(" "));
  if (title === query) return 5;
  if (document.aliases.some((value) => normalizeSearchText(value) === query)) {
    return 4;
  }
  if (document.source.some((value) => normalizeSearchText(value) === query)) {
    return 4;
  }
  if (title.includes(query)) return 3;
  if (uniqueTerms(query).every((term) => tokenSet(title).has(term))) return 2;
  return 0;
}

function proximityBonus(document: CatalogSearchDocument, query: string) {
  const titleTerms = normalizeSearchText(document.title.join(" "))
    .split(" ")
    .filter(Boolean);
  const positions = uniqueTerms(query).map((term) => titleTerms.indexOf(term));
  if (positions.length === 0 || positions.some((position) => position < 0)) {
    return 0;
  }
  const span = Math.max(...positions) - Math.min(...positions);
  const gaps = Math.max(0, span - (positions.length - 1));
  return Math.max(0, 99 - gaps);
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1] +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function fuzzyForTerm(term: string) {
  const edits = allowedEditDistance(term);
  return edits === 0 ? false : edits;
}

function prefixForTerm(term: string) {
  return term.length >= 3;
}

function bestTermMatch(
  result: SearchResult,
  queryTerm: string,
): TermMatch | null {
  if (result.terms.includes(queryTerm)) {
    return { kind: "exact", matchedTerm: queryTerm, queryTerm };
  }

  const prefix = result.terms
    .filter((term) => term.startsWith(queryTerm))
    .sort(
      (left, right) => left.length - right.length || left.localeCompare(right),
    )
    .at(0);
  if (prefix) return { kind: "prefix", matchedTerm: prefix, queryTerm };

  const distanceLimit = allowedEditDistance(queryTerm);
  if (distanceLimit === 0) return null;
  const fuzzy = result.terms
    .map((term) => ({
      distance: levenshteinDistance(queryTerm, term),
      term,
    }))
    .filter(({ distance }) => distance <= distanceLimit)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.term.localeCompare(right.term),
    )
    .at(0);
  return fuzzy ? { kind: "fuzzy", matchedTerm: fuzzy.term, queryTerm } : null;
}

function evidenceValue(
  document: CatalogSearchDocument,
  field: SearchFieldName,
  matchedTerm: string,
) {
  return (
    document[field].find((value) => tokenSet(value).has(matchedTerm)) ??
    document[field][0] ??
    matchedTerm
  );
}

function evidenceForResult(
  document: CatalogSearchDocument,
  result: SearchResult,
  query: string,
) {
  return uniqueTerms(query).flatMap((queryTerm): SearchEvidence[] => {
    const match = bestTermMatch(result, queryTerm);
    if (!match) return [];
    const field = EVIDENCE_FIELD_PRIORITY.find((candidate) =>
      result.match[match.matchedTerm]?.includes(candidate),
    );
    if (!field) return [];
    return [
      {
        field,
        value: evidenceValue(document, field, match.matchedTerm),
        ...match,
      },
    ];
  });
}

function exactEvidence(document: CatalogSearchDocument, query: string) {
  return uniqueTerms(query).flatMap((term): SearchEvidence[] => {
    const field = EVIDENCE_FIELD_PRIORITY.find((candidate) =>
      document[candidate].some((value) => tokenSet(value).has(term)),
    );
    if (!field) return [];
    return [
      {
        field,
        value: evidenceValue(document, field, term),
        kind: "exact",
        queryTerm: term,
        matchedTerm: term,
      },
    ];
  });
}

function matchScore(
  document: CatalogSearchDocument,
  fullQuery: string,
  exactnessTier: 1 | 2 | 3,
  miniSearchScore: number,
) {
  return (
    exactnessTier * 1_000_000 +
    authorityTier(document, fullQuery) * 100_000 +
    proximityBonus(document, fullQuery) * 1_000 +
    Math.min(miniSearchScore, 999)
  );
}

function reportSearchFailure(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  }
}

function degradedFallback(
  documents: CatalogSearchDocument[],
  query: string,
): CatalogSearchResults {
  return { ...exactAllTermSearch(documents, query), degraded: true };
}

function conservativeCorrection(original: string, candidate: string) {
  const originalTerms = uniqueTerms(original);
  const candidateTerms = uniqueTerms(candidate);
  if (originalTerms.length !== candidateTerms.length) return false;
  return originalTerms.every((term, index) => {
    const candidateTerm = candidateTerms[index];
    return (
      candidateTerm !== undefined &&
      levenshteinDistance(term, candidateTerm) <= allowedEditDistance(term)
    );
  });
}

function correctionForQuery(miniSearch: MiniSearch, query: string) {
  const exactOrPrefix = miniSearch.search(query, {
    combineWith: "AND",
    fuzzy: false,
    prefix: prefixForTerm,
  });
  if (exactOrPrefix.length > 0) return null;

  const suggestions = miniSearch.autoSuggest(query, {
    combineWith: "AND",
    fuzzy: fuzzyForTerm,
    maxFuzzy: 2,
    prefix: prefixForTerm,
  });
  for (const suggestion of suggestions) {
    const candidate = searchMeaning(suggestion.suggestion);
    if (
      candidate &&
      candidate !== query &&
      conservativeCorrection(query, candidate) &&
      miniSearch.search(candidate).length > 0
    ) {
      return candidate;
    }
  }
  return null;
}

export function exactAllTermSearch(
  documents: CatalogSearchDocument[],
  query: string,
): CatalogSearchResults {
  const normalizedQuery = searchMeaning(query);
  const fullQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return {
      normalizedQuery,
      matches: [],
      correction: null,
      degraded: false,
    };
  }

  const terms = uniqueTerms(normalizedQuery);
  const matches = documents
    .filter((document) => {
      const tokens = tokenSet(documentText(document));
      return terms.every((term) => tokens.has(term));
    })
    .map((document): CatalogSearchMatch => ({
      id: document.id,
      score: matchScore(document, fullQuery, 3, 0),
      evidence: exactEvidence(document, normalizedQuery),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    );

  return {
    normalizedQuery,
    matches,
    correction: null,
    degraded: false,
  };
}

export function createCatalogSearchIndex(
  documents: CatalogSearchDocument[],
): CatalogSearchIndex {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  let miniSearch: MiniSearch<CatalogSearchDocument>;

  try {
    miniSearch = new MiniSearch<CatalogSearchDocument>({
      fields: [...SEARCH_FIELD_NAMES],
      storeFields: ["id"],
      extractField: (document, fieldName) => {
        const value = document[fieldName as keyof CatalogSearchDocument];
        return Array.isArray(value) ? value.join(" ") : String(value ?? "");
      },
      tokenize: searchDocumentTerms,
      processTerm: (term) => term,
      searchOptions: {
        boost: FIELD_BOOST,
        combineWith: "AND",
        fuzzy: fuzzyForTerm,
        maxFuzzy: 2,
        prefix: prefixForTerm,
      },
    });
    miniSearch.addAll(documents);
  } catch (error) {
    reportSearchFailure(
      "Catalog search initialization failed; using exact-token fallback.",
      error,
    );
    return {
      search: (query) => degradedFallback(documents, query),
    };
  }

  return {
    search(query) {
      const normalizedQuery = searchMeaning(query);
      const fullQuery = normalizeSearchText(query);
      if (!normalizedQuery) {
        return {
          normalizedQuery,
          matches: [],
          correction: null,
          degraded: false,
        };
      }

      try {
        const results = miniSearch.search(normalizedQuery);
        const matches = results
          .flatMap((result): CatalogSearchMatch[] => {
            const document = documentsById.get(String(result.id));
            if (!document) return [];
            const termMatches = uniqueTerms(normalizedQuery)
              .map((term) => bestTermMatch(result, term))
              .filter((match): match is TermMatch => match !== null);
            if (termMatches.length !== uniqueTerms(normalizedQuery).length) {
              return [];
            }
            const exactnessTier = termMatches.some(
              ({ kind }) => kind === "fuzzy",
            )
              ? 1
              : termMatches.some(({ kind }) => kind === "prefix")
                ? 2
                : 3;
            return [
              {
                id: document.id,
                score: matchScore(
                  document,
                  fullQuery,
                  exactnessTier,
                  result.score,
                ),
                evidence: evidenceForResult(document, result, normalizedQuery),
              },
            ];
          })
          .sort(
            (left, right) =>
              right.score - left.score || left.id.localeCompare(right.id),
          );

        return {
          normalizedQuery,
          matches,
          correction: correctionForQuery(miniSearch, normalizedQuery),
          degraded: false,
        };
      } catch (error) {
        reportSearchFailure(
          "Catalog search query failed; using exact-token fallback.",
          error,
        );
        return degradedFallback(documents, query);
      }
    },
  };
}
