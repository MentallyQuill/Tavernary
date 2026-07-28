import { expect, test } from "vitest";

import {
  proposeFrontendVocabularyEntry,
  reconcileFrontends,
} from "../../scripts/submissions/frontend-reconciliation.mjs";

const vocabulary = {
  frontends: [
    {
      id: "sillytavern",
      label: "SillyTavern",
      description: "Works with the SillyTavern roleplay frontend.",
    },
    {
      id: "lumiverse",
      label: "Lumiverse",
      description: "Works with the Lumiverse roleplay frontend.",
    },
    {
      id: "tavern-ai",
      label: "TavernAI",
      description: "Works with the TavernAI roleplay frontend.",
    },
    {
      id: "tavern-ui",
      label: "TavernUI",
      description: "Works with the TavernUI roleplay frontend.",
    },
  ],
};

const frontendProjects = [
  {
    id: "prolix-oc-lumiverse",
    name: "Lumiverse",
    kind: "frontend",
    source: {
      type: "github",
      repository: "prolix-oc/Lumiverse",
      repository_id: 1175596366,
    },
    frontends: ["lumiverse"],
  },
  {
    id: "example-nova",
    name: "Nova",
    kind: "frontend",
    source: {
      type: "url",
      url: "https://codeberg.org/example/nova",
    },
    frontends: ["nova"],
  },
];

test("matches IDs, labels, aliases, and frontend repository URLs", () => {
  const result = reconcileFrontends({
    projectType: "extension",
    knownIds: ["sillytavern"],
    other: [
      {
        name: "Lumi Verse",
        url: "https://github.com/prolix-oc/Lumiverse",
      },
    ],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });

  expect(result).toEqual({
    status: "resolved",
    ids: ["sillytavern", "lumiverse"],
    warnings: [],
  });
});

test("matches submitted labels and explicit aliases", () => {
  const result = reconcileFrontends({
    projectType: "extension",
    knownIds: [],
    other: [
      { name: "SillyTavern", url: "" },
      { name: "Lumi Verse", url: "" },
    ],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });

  expect(result).toEqual({
    status: "resolved",
    ids: ["sillytavern", "lumiverse"],
    warnings: [],
  });
});

test("classifies an unknown GitHub frontend as a dependency", () => {
  expect(
    reconcileFrontends({
      projectType: "extension",
      knownIds: ["sillytavern"],
      other: [
        {
          name: "Aikobots",
          url: "https://github.com/aikohanasaki/Aikobots",
        },
      ],
      frontendIndependent: false,
      vocabulary,
      frontendProjects,
    }),
  ).toEqual({
    status: "needs-information",
    errors: ["Aikobots is not currently indexed as a Tavernary frontend."],
    suggestions: [],
    dependencies: [
      {
        name: "Aikobots",
        canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
        repository: "aikohanasaki/Aikobots",
      },
    ],
  });
});

test("matches an indexed external Frontend by canonical source URL", () => {
  expect(
    reconcileFrontends({
      projectType: "extension",
      knownIds: [],
      other: [
        {
          name: "",
          url: "https://codeberg.org/example/nova/",
        },
      ],
      frontendIndependent: false,
      vocabulary: {
        frontends: [
          ...vocabulary.frontends,
          {
            id: "nova",
            label: "Nova",
            description: "Works with the Nova roleplay frontend.",
          },
        ],
      },
      frontendProjects,
    }),
  ).toEqual({
    status: "resolved",
    ids: ["nova"],
    warnings: [],
  });
});

test("classifies an unknown public source Frontend as a dependency", () => {
  expect(
    reconcileFrontends({
      projectType: "extension",
      knownIds: [],
      other: [{ name: "New UI", url: "https://codeberg.org/example/new-ui/" }],
      frontendIndependent: false,
      vocabulary,
      frontendProjects,
    }),
  ).toEqual({
    status: "needs-information",
    errors: ["New UI is not currently indexed as a Tavernary frontend."],
    suggestions: [],
    dependencies: [
      {
        name: "New UI",
        canonicalUrl: "https://codeberg.org/example/new-ui",
        repository: "example/new-ui",
      },
    ],
  });
});

test("returns candidates instead of guessing an ambiguous typo", () => {
  const result = reconcileFrontends({
    projectType: "preset",
    knownIds: [],
    other: [{ name: "Tavern", url: "" }],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });

  expect(result.status).toBe("needs-information");
  if (result.status === "needs-information") {
    expect(result.suggestions[0].candidates.length).toBeGreaterThan(1);
  }
});

test("rejects frontend-independent extensions", () => {
  const result = reconcileFrontends({
    projectType: "extension",
    knownIds: [],
    other: [],
    frontendIndependent: true,
    vocabulary,
    frontendProjects,
  });

  expect(result).toEqual({
    status: "needs-information",
    errors: ["Extensions must identify at least one supported frontend."],
    suggestions: [],
    dependencies: [],
  });
});

test("requires a frontend for non-independent presets", () => {
  const result = reconcileFrontends({
    projectType: "preset",
    knownIds: [],
    other: [],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });

  expect(result).toEqual({
    status: "needs-information",
    errors: ["Select a supported frontend or mark the preset independent."],
    suggestions: [],
    dependencies: [],
  });
});

test("proposes a normalized vocabulary entry for a new frontend", () => {
  const proposal = proposeFrontendVocabularyEntry({
    displayName: "Nova Frontend",
    sourceIdentity: {
      kind: "github",
      canonicalUrl: "https://github.com/NovaOrg/Nova",
      repository: "NovaOrg/Nova",
      repositoryId: 42,
      owner: "NovaOrg",
      name: "Nova",
    },
    vocabulary,
    frontendProjects,
  });

  expect(proposal).toEqual({
    entry: {
      id: "nova-frontend",
      label: "Nova Frontend",
      description: "Works with the Nova Frontend roleplay frontend.",
    },
    warning: null,
  });
});

test("adds the GitHub owner when a proposed frontend ID collides", () => {
  const proposal = proposeFrontendVocabularyEntry({
    displayName: "Lumiverse",
    sourceIdentity: {
      kind: "github",
      canonicalUrl: "https://github.com/OtherOrg/Lumiverse",
      repository: "OtherOrg/Lumiverse",
      repositoryId: 43,
      owner: "OtherOrg",
      name: "Lumiverse",
    },
    vocabulary,
    frontendProjects,
  });

  expect(proposal).toMatchObject({
    entry: { id: "lumiverse-otherorg", label: "Lumiverse" },
    warning:
      "Frontend ID lumiverse was already used; proposed lumiverse-otherorg.",
  });
});

test("adds the source host when an external Frontend ID collides", () => {
  const proposal = proposeFrontendVocabularyEntry({
    displayName: "Lumiverse",
    sourceIdentity: {
      kind: "external",
      canonicalUrl: "https://codeberg.org/example/lumiverse",
      hostname: "codeberg.org",
      pathSlug: "lumiverse",
    },
    vocabulary,
    frontendProjects,
  });

  expect(proposal).toMatchObject({
    entry: { id: "lumiverse-codeberg-org", label: "Lumiverse" },
    warning:
      "Frontend ID lumiverse was already used; proposed lumiverse-codeberg-org.",
  });
});
