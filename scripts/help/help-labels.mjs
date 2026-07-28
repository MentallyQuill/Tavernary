export const HELP_LABEL_DEFINITIONS = Object.freeze({
  "project-information": Object.freeze({
    color: "5319e7",
    description: "Report about a project listing in the Tavernary catalog.",
  }),
  "website-bug": Object.freeze({
    color: "d73a4a",
    description: "Report about Tavernary website behavior.",
  }),
  "kit-report": Object.freeze({
    color: "d876e3",
    description: "Report about a published Tavernary Kit.",
  }),
  other: Object.freeze({
    color: "6e7781",
    description: "Public Help request that does not fit another form.",
  }),
  "project-owner-request": Object.freeze({
    color: "0e8a16",
    description: "Listing request from a project owner or maintainer.",
  }),
  "safety-review": Object.freeze({
    color: "b60205",
    description: "Public content requires a maintainer safety review.",
  }),
  "rights-review": Object.freeze({
    color: "fbca04",
    description: "Public content requires a maintainer rights review.",
  }),
  accessibility: Object.freeze({
    color: "0075ca",
    description: "Website report concerns accessibility.",
  }),
  bug: Object.freeze({
    color: "d73a4a",
    description: "Something is not working as intended.",
  }),
  question: Object.freeze({
    color: "d876e3",
    description: "Public request asks for information or guidance.",
  }),
  "duplicate-candidate": Object.freeze({
    color: "fbca04",
    description: "Report may identify duplicate catalog content.",
  }),
});

export const HELP_ROUTE_BY_LABEL = Object.freeze({
  "project-information": "project-report",
  "website-bug": "website-bug",
  "kit-report": "kit-report",
  other: "other-help",
});

export const HELP_LABEL_BY_ROUTE = Object.freeze(
  Object.fromEntries(
    Object.entries(HELP_ROUTE_BY_LABEL).map(([label, route]) => [route, label]),
  ),
);

export const PUBLIC_HELP_TRIAGE_LABELS = Object.freeze([
  "project-information",
  "website-bug",
  "kit-report",
  "other",
  "safety-review",
  "rights-review",
  "accessibility",
  "bug",
  "question",
  "duplicate-candidate",
]);

const projectSecondaryLabels = Object.freeze({
  "duplicate-or-wrong-listing": Object.freeze(["duplicate-candidate"]),
  "unsafe-or-malicious": Object.freeze(["safety-review"]),
  "abusive-or-inappropriate": Object.freeze(["safety-review"]),
  "rights-concern": Object.freeze(["rights-review"]),
});

const kitSecondaryLabels = Object.freeze({
  "unsafe-or-malicious-included-project": Object.freeze(["safety-review"]),
  "abusive-or-inappropriate-content": Object.freeze(["safety-review"]),
  "duplicate-kit": Object.freeze(["duplicate-candidate"]),
  "author-or-attribution-concern": Object.freeze(["rights-review"]),
});

export function categoryLabels(manifest) {
  const category = manifest.payload.category;
  if (manifest.request_kind === "project-report") {
    return ["project-information", ...(projectSecondaryLabels[category] ?? [])];
  }
  if (manifest.request_kind === "website-bug") {
    return [
      "website-bug",
      "bug",
      ...(category === "accessibility" ? ["accessibility"] : []),
    ];
  }
  if (manifest.request_kind === "kit-report") {
    return ["kit-report", ...(kitSecondaryLabels[category] ?? [])];
  }
  if (manifest.request_kind === "other-help") {
    return [
      "other",
      ...(category === "suggest-improvement" ? [] : ["question"]),
    ];
  }
  return [];
}
