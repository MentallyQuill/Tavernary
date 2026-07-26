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
