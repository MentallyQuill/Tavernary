import { expect, test } from "vitest";

import { loadReadmeSource } from "../../scripts/catalog/readme-source.mjs";

const record = {
  id: "fixture",
  source: { type: "github", repository: "Creator/Project" },
};

const snapshot = {
  repository: {
    owner: "Creator",
    name: "Project",
    default_branch: "main",
    description: "A short project description.",
  },
  readme: { found: true, path: "README.md", ref: "main" },
};

test("prefers a non-empty repository description without fetching README", async () => {
  const calls: string[] = [];
  const source = await loadReadmeSource(record, snapshot, {
    github: async (path) => {
      calls.push(path);
      return null;
    },
  });

  expect(source).toEqual({
    repositoryDescription: "A short project description.",
    readmeText: null,
    readmePath: null,
    readmeRef: null,
  });
  expect(calls).toEqual([]);
});

test("decodes and normalizes README text when description is unavailable", async () => {
  let request;
  const source = await loadReadmeSource(
    record,
    {
      ...snapshot,
      repository: { ...snapshot.repository, description: "   " },
    },
    {
      github: async (path, options) => {
        request = { path, options };
        return {
          path: "README.md",
          encoding: "base64",
          content: Buffer.from(
            "\uFEFF# Project\r\n\r\nUseful tool.\n",
          ).toString("base64"),
        };
      },
    },
  );

  expect(request).toEqual({
    path: "/repos/Creator/Project/readme",
    options: { ref: "main" },
  });
  expect(source).toEqual({
    repositoryDescription: null,
    readmeText: "# Project\n\nUseful tool.",
    readmePath: "README.md",
    readmeRef: "main",
  });
});

test.each([
  ["missing README", null],
  ["empty README", { path: "README.md", encoding: "base64", content: "" }],
  [
    "binary README",
    {
      path: "README.md",
      encoding: "base64",
      content: Buffer.from([0, 1, 2]).toString("base64"),
    },
  ],
  [
    "badge-only README",
    {
      path: "README.md",
      encoding: "base64",
      content: Buffer.from(
        '<a href="https://badge.fury.io"><img src="badge.svg"></a>\n',
      ).toString("base64"),
    },
  ],
] as const)("returns null text for %s", async (_name, response) => {
  const source = await loadReadmeSource(
    record,
    {
      ...snapshot,
      repository: { ...snapshot.repository, description: null },
    },
    { github: async () => response },
  );

  expect(source.repositoryDescription).toBeNull();
  expect(source.readmeText).toBeNull();
});

test("returns null when the snapshot has no README provenance", async () => {
  const source = await loadReadmeSource(
    record,
    {
      ...snapshot,
      readme: { found: false, path: null, ref: "main" },
      repository: { ...snapshot.repository, description: null },
    },
    { github: async () => null },
  );

  expect(source).toEqual({
    repositoryDescription: null,
    readmeText: null,
    readmePath: null,
    readmeRef: null,
  });
});
