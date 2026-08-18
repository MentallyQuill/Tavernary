const string = { type: "string" } as const;
const nonemptyString = { type: "string", minLength: 1 } as const;
const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;
const nullableDateTime = {
  anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
} as const;
const nullableNonnegativeInteger = {
  anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
} as const;
const nullableNonnegativeNumber = {
  anyOf: [{ type: "number", minimum: 0 }, { type: "null" }],
} as const;
const safeHttpUrl = {
  type: "string",
  format: "safe-http-url",
} as const;
const nullableSafeHttpUrl = {
  anyOf: [safeHttpUrl, { type: "null" }],
} as const;
const nullableSafeNavigationUrl = {
  anyOf: [{ type: "string", format: "safe-navigation-url" }, { type: "null" }],
} as const;

const label = {
  type: "object",
  additionalProperties: false,
  required: ["description", "id", "label"],
  properties: {
    id: nonemptyString,
    label: nonemptyString,
    description: string,
  },
} as const;

const tag = {
  type: "object",
  additionalProperties: false,
  required: ["description", "facet", "id", "label"],
  properties: {
    ...label.properties,
    facet: { enum: ["goal", "trait"] },
  },
} as const;

const searchFields = {
  type: "object",
  additionalProperties: false,
  required: [
    "aliases",
    "compatibility",
    "frontends",
    "kind",
    "maintainers",
    "primaryFunction",
    "relationships",
    "source",
    "summary",
    "tags",
    "title",
  ],
  properties: Object.fromEntries(
    [
      "aliases",
      "compatibility",
      "frontends",
      "kind",
      "maintainers",
      "primaryFunction",
      "relationships",
      "source",
      "summary",
      "tags",
      "title",
    ].map((field) => [
      field,
      { type: "array", items: string, uniqueItems: true },
    ]),
  ),
} as const;

const account = {
  type: "object",
  additionalProperties: false,
  required: ["login", "provider"],
  properties: {
    provider: { enum: ["github", "codeberg"] },
    login: nonemptyString,
  },
} as const;

const contributor = {
  type: "object",
  additionalProperties: false,
  required: ["botOrAi", "login", "provider"],
  properties: {
    ...account.properties,
    botOrAi: { type: "boolean" },
  },
} as const;

const report = {
  type: "object",
  additionalProperties: false,
  required: [
    "assessedAt",
    "assessmentSource",
    "citedFindingIds",
    "contextualReviewPolicyVersion",
    "dangerBasis",
    "headline",
    "highDanger",
    "maliciousEvidence",
    "materialConcerns",
    "minorCautions",
    "reportId",
    "reportUrl",
    "riskLevel",
    "scannedAt",
    "scannedSha",
    "scannerPolicyVersion",
    "summary",
    "synthesisModel",
    "synthesisPolicyVersion",
    "technicalHistoryUrl",
    "treeUrl",
  ],
  properties: {
    reportId: nonemptyString,
    riskLevel: { enum: ["low", "material", "high"] },
    headline: string,
    summary: string,
    minorCautions: { type: "integer", minimum: 0 },
    materialConcerns: { type: "integer", minimum: 0 },
    highDanger: { type: "integer", minimum: 0 },
    maliciousEvidence: string,
    citedFindingIds: {
      type: "array",
      items: nonemptyString,
      uniqueItems: true,
    },
    scannedSha: { type: "string", pattern: "^[0-9a-f]{40}$" },
    treeUrl: safeHttpUrl,
    scannedAt: { type: "string", format: "date-time" },
    assessedAt: { type: "string", format: "date-time" },
    scannerPolicyVersion: nonemptyString,
    contextualReviewPolicyVersion: nonemptyString,
    synthesisPolicyVersion: nonemptyString,
    synthesisModel: nonemptyString,
    dangerBasis: {
      enum: [
        "none",
        "malicious_or_compromised",
        "critical_exploitable_vulnerability",
        "mixed",
      ],
    },
    assessmentSource: {
      enum: ["model", "deterministic_fallback", "deterministic_regrade"],
    },
    reportUrl: safeHttpUrl,
    technicalHistoryUrl: nullableSafeHttpUrl,
  },
} as const;

const project = {
  type: "object",
  additionalProperties: false,
  required: [
    "activity",
    "attribution",
    "canonicalUrl",
    "catalogCohort",
    "catalogedAt",
    "community",
    "fork",
    "frontends",
    "id",
    "install",
    "kind",
    "latestReleaseAt",
    "license",
    "metadataStatus",
    "name",
    "preset",
    "primaryFunction",
    "refreshedAt",
    "repositorySizeKb",
    "search",
    "sourceStatus",
    "staleSince",
    "summary",
    "tags",
    "tavernKeeper",
  ],
  properties: {
    id: nonemptyString,
    name: nonemptyString,
    kind: { enum: ["frontend", "extension", "preset"] },
    metadataStatus: { enum: ["provisional", "curated"] },
    sourceStatus: { enum: ["pending", "healthy", "stale", "manual"] },
    primaryFunction: nonemptyString,
    summary: string,
    canonicalUrl: safeHttpUrl,
    catalogedAt: { type: "string", format: "date-time" },
    catalogCohort: { enum: ["seed", "standard"] },
    frontends: { type: "array", items: label },
    tags: { type: "array", items: tag },
    search: searchFields,
    tavernKeeper: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "currentSha",
            "freshness",
            "history",
            "historyUrl",
            "report",
            "riskLevel",
            "state",
          ],
          properties: {
            state: {
              enum: ["teal", "orange", "red", "gray", "unsupported"],
            },
            riskLevel: {
              anyOf: [{ enum: ["low", "material", "high"] }, { type: "null" }],
            },
            freshness: {
              enum: [
                "current",
                "stale",
                "unavailable",
                "unassessed",
                "unsupported",
              ],
            },
            currentSha: {
              anyOf: [
                { type: "string", pattern: "^[0-9a-f]{40}$" },
                { type: "null" },
              ],
            },
            report: { anyOf: [report, { type: "null" }] },
            history: { type: "array", items: report },
            historyUrl: nullableSafeNavigationUrl,
          },
        },
      ],
    },
    fork: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["parentName", "parentProjectId", "parentUrl", "status"],
          properties: {
            parentName: nonemptyString,
            parentProjectId: nullableString,
            parentUrl: nullableSafeHttpUrl,
            status: {
              enum: ["published", "repository", "not-listed", "unavailable"],
            },
          },
        },
      ],
    },
    attribution: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "contributors",
            "humanContributorCount",
            "owner",
            "status",
          ],
          properties: {
            owner: account,
            contributors: { type: "array", items: contributor },
            humanContributorCount: { type: "integer", minimum: 0 },
            status: { enum: ["current", "partial", "stale", "pending"] },
          },
        },
      ],
    },
    activity: {
      type: "object",
      additionalProperties: false,
      required: [
        "activeWeeks12",
        "dormant",
        "evidenceStatus",
        "latestSourceActivityAt",
        "weeklyActivity",
      ],
      properties: {
        latestSourceActivityAt: nullableDateTime,
        activeWeeks12: nullableNonnegativeInteger,
        weeklyActivity: {
          anyOf: [
            {
              type: "array",
              items: { type: "boolean" },
              minItems: 12,
              maxItems: 12,
            },
            { type: "null" },
          ],
        },
        evidenceStatus: {
          anyOf: [
            { enum: ["provisional", "complete", "degraded"] },
            { type: "null" },
          ],
        },
        dormant: { type: "boolean" },
      },
    },
    latestReleaseAt: nullableDateTime,
    community: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["aggregate", "forks", "stars", "watchers"],
          properties: {
            stars: { type: "integer", minimum: 0 },
            forks: { type: "integer", minimum: 0 },
            watchers: { type: "integer", minimum: 0 },
            aggregate: { type: "integer", minimum: 0 },
          },
        },
      ],
    },
    repositorySizeKb: nullableNonnegativeInteger,
    license: {
      type: "object",
      additionalProperties: false,
      required: ["label", "status", "tooltip"],
      properties: {
        status: {
          enum: ["osi-approved", "proprietary", "missing", "pending"],
        },
        label: nonemptyString,
        tooltip: string,
      },
    },
    preset: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "artifactSizeBytes",
            "completionFormats",
            "modelFamilies",
            "publishedAt",
            "version",
          ],
          properties: {
            version: nullableString,
            publishedAt: nullableDateTime,
            artifactSizeBytes: nullableNonnegativeInteger,
            modelFamilies: { type: "array", items: label },
            completionFormats: { type: "array", items: label },
          },
        },
      ],
    },
    refreshedAt: nullableDateTime,
    staleSince: nullableDateTime,
    install: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "branch",
            "folderName",
            "kind",
            "manifestPath",
            "repositoryUrl",
          ],
          properties: {
            kind: { const: "sillytavern-extension-git" },
            repositoryUrl: string,
            branch: nullableString,
            manifestPath: { const: "manifest.json" },
            folderName: string,
          },
        },
      ],
    },
  },
} as const;

const kit = {
  type: "object",
  additionalProperties: false,
  required: [
    "author",
    "components",
    "description",
    "flaggedProjectCount",
    "frontends",
    "id",
    "modelFamilies",
    "publishedAt",
    "purposes",
    "search",
    "sourceIssueNumber",
    "sourceIssueUrl",
    "supportRefreshedAt",
    "supportStale",
    "supporterCount",
    "title",
    "trendingScore",
    "updatedAt",
  ],
  properties: {
    id: nonemptyString,
    title: nonemptyString,
    description: string,
    author: {
      type: "object",
      additionalProperties: false,
      required: ["githubUserId", "login"],
      properties: {
        githubUserId: { type: "integer", minimum: 1 },
        login: nonemptyString,
      },
    },
    sourceIssueNumber: { type: "integer", minimum: 1 },
    sourceIssueUrl: safeHttpUrl,
    publishedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    frontends: { type: "array", items: label },
    purposes: { type: "array", items: label },
    modelFamilies: { type: "array", items: label },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "availability",
          "canonicalUrl",
          "kind",
          "name",
          "primaryFunction",
          "project",
          "projectId",
          "unavailableReason",
        ],
        properties: {
          projectId: nonemptyString,
          name: nonemptyString,
          kind: { enum: ["frontend", "extension", "preset"] },
          primaryFunction: nonemptyString,
          availability: { enum: ["available", "flagged"] },
          unavailableReason: nullableString,
          canonicalUrl: nullableSafeHttpUrl,
          project: {
            anyOf: [{ $ref: "#/$defs/project" }, { type: "null" }],
          },
        },
      },
    },
    supporterCount: nullableNonnegativeInteger,
    trendingScore: nullableNonnegativeNumber,
    supportRefreshedAt: nullableDateTime,
    supportStale: { type: "boolean" },
    flaggedProjectCount: { type: "integer", minimum: 0 },
    search: searchFields,
  },
} as const;

export const catalogV7Schema = {
  $id: "https://tavernary.org/schemas/catalog-v7.json",
  type: "object",
  additionalProperties: false,
  required: [
    "generatedAt",
    "kits",
    "projects",
    "schemaVersion",
    "tagVocabulary",
  ],
  properties: {
    schemaVersion: { const: 7 },
    generatedAt: { type: "string", format: "date-time" },
    tagVocabulary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "aliases",
          "applicable_kinds",
          "description",
          "facet",
          "id",
          "label",
        ],
        properties: {
          ...tag.properties,
          aliases: { type: "array", items: string, uniqueItems: true },
          applicable_kinds: {
            type: "array",
            items: { enum: ["frontend", "extension", "preset"] },
            uniqueItems: true,
          },
        },
      },
    },
    projects: { type: "array", items: { $ref: "#/$defs/project" } },
    kits: { type: "array", items: { $ref: "#/$defs/kit" } },
  },
  $defs: { project, kit },
} as const;
