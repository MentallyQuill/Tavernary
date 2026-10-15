import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import {
  commitCanonicalData,
  verifyCanonicalData,
} from "../../scripts/automation/canonical-data.mjs";
import { preparedResultFixture } from "../helpers/automation-fixtures";
import { maximumModelBudgetFixture } from "../helpers/model-budget-fixtures";
function fixture() {
  const files = preparedResultFixture().files;
  const requests: Array<{ args: string[]; body: Record<string, unknown> }> = [];
  const gh = vi.fn(async (args: string[], input?: string) => {
    const body = input ? JSON.parse(input) : {};
    requests.push({ args, body });
    if (args[1]?.endsWith("/git/commits/" + "b".repeat(40)))
      return JSON.stringify({
        sha: "b".repeat(40),
        tree: { sha: "a".repeat(40) },
      });
    if (args.includes("POST") && args.includes("repos/Owner/Repo/git/blobs"))
      return JSON.stringify({ sha: "c".repeat(40) });
    if (args.includes("POST") && args.includes("repos/Owner/Repo/git/trees"))
      return JSON.stringify({ sha: "d".repeat(40) });
    if (args.includes("POST") && args.includes("repos/Owner/Repo/git/commits"))
      return JSON.stringify({ sha: "e".repeat(40) });
    if (args.includes("PATCH"))
      return JSON.stringify({
        ref: "refs/heads/main",
        object: { sha: "e".repeat(40) },
      });
    if (args[1]?.includes("/compare/"))
      return JSON.stringify({
        status: "ahead",
        merge_base_commit: { sha: "e".repeat(40) },
      });
    if (args[1]?.includes("/contents/"))
      return JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(files[0].content).toString("base64"),
      });
    throw new Error(`Unexpected call: ${args.join(" ")}`);
  });
  return {
    gh,
    requests,
    files,
    repository: "Owner/Repo",
    expectedMainSha: "b".repeat(40),
    message: "chore(catalog): publish prepared refresh",
  };
}

test("canonical publication writes the full bounded global model ledger", async () => {
  const input = fixture();
  const content = `${JSON.stringify(maximumModelBudgetFixture(), null, 2)}\n`;
  const file = {
    path: "data/maintenance/automation/model-budgets/global.json",
    type: "file" as const,
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  };
  expect(await commitCanonicalData({ ...input, files: [file] })).toEqual({
    sha: "e".repeat(40),
  });
  const blob = input.requests.find((request) =>
    request.args.includes("repos/Owner/Repo/git/blobs"),
  );
  expect(
    Buffer.from(String(blob?.body.content), "base64").toString("utf8"),
  ).toBe(content);
  const original = input.gh.getMockImplementation()!;
  input.gh.mockImplementation(async (args, body) => {
    if (args[1]?.includes("/contents/"))
      return JSON.stringify({
        type: "file",
        encoding: "none",
        sha: "c".repeat(40),
      });
    if (args[1]?.endsWith(`/git/blobs/${"c".repeat(40)}`))
      return JSON.stringify({
        sha: "c".repeat(40),
        size: file.bytes,
        encoding: "base64",
        content: Buffer.from(content).toString("base64"),
      });
    return original(args, body);
  });
  expect(
    await verifyCanonicalData({
      ...input,
      files: [file],
      sha: "e".repeat(40),
      mainSha: "e".repeat(40),
    }),
  ).toBe(true);
});

test.each(["global", "other", "batch"])(
  "the model ledger byte allowance rejects an oversized %s before remote writes",
  async (variant) => {
    const input = fixture();
    const bytes = variant === "other" ? 8_388_609 : 25_165_825;
    const content = JSON.stringify({ payload: "x".repeat(bytes - 14) });
    const file = {
      path: `data/maintenance/automation/model-budgets/${variant === "other" ? "other" : "global"}.json`,
      type: "file" as const,
      content,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
      baseDigest: null,
    };
    let files = [file];
    if (variant === "batch") {
      const boundedContent = JSON.stringify({
        payload: "x".repeat(24_000_000),
      });
      const catalogContent = JSON.stringify({
        payload: "x".repeat(12_000_000),
      });
      files = [
        {
          ...file,
          content: boundedContent,
          bytes: Buffer.byteLength(boundedContent),
          sha256: createHash("sha256").update(boundedContent).digest("hex"),
        },
        {
          ...file,
          path: "public/catalog/tavernary-catalog.json",
          content: catalogContent,
          bytes: Buffer.byteLength(catalogContent),
          sha256: createHash("sha256").update(catalogContent).digest("hex"),
        },
      ];
    }
    await expect(commitCanonicalData({ ...input, files })).rejects.toThrow();
    expect(input.requests).toEqual([]);
  },
);

test("canonical publication commits both generated catalogs above the per-record size limit", async () => {
  const input = fixture();
  const content = JSON.stringify({ projects: "x".repeat(12_000_000) });
  const catalogs = [
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ].map((path) => ({
    path,
    type: "file" as const,
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  }));
  expect(
    await commitCanonicalData({
      ...input,
      files: [...input.files, ...catalogs],
    }),
  ).toEqual({ sha: "e".repeat(40) });
  expect(
    input.requests.find((request) =>
      request.args.includes("repos/Owner/Repo/git/trees"),
    )?.body.tree,
  ).toEqual([
    {
      path: input.files[0].path,
      mode: "100644",
      type: "blob",
      sha: "c".repeat(40),
    },
    {
      path: catalogs[0].path,
      mode: "100644",
      type: "blob",
      sha: "c".repeat(40),
    },
    {
      path: catalogs[1].path,
      mode: "100644",
      type: "blob",
      sha: "c".repeat(40),
    },
  ]);
});

test.each(["record", "catalog", "batch"])(
  "canonical publication rejects oversized valid JSON at its %s boundary before GitHub access",
  async (variant) => {
    const input = fixture();
    const bytes =
      variant === "record"
        ? 8_388_609
        : variant === "catalog"
          ? 16_777_217
          : 16_777_216;
    const content = JSON.stringify({ payload: "x".repeat(bytes - 14) });
    const file = {
      ...input.files[0],
      path:
        variant === "record"
          ? input.files[0].path
          : "public/catalog/tavernary-catalog.json",
      content,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    };
    const files =
      variant === "batch"
        ? [
            file,
            { ...file, path: "public/catalog/tavernary-catalog-v8.json" },
            ...input.files,
          ]
        : [file];
    await expect(commitCanonicalData({ ...input, files })).rejects.toThrow();
    expect(input.requests).toEqual([]);
  },
);
test("canonical publication creates one parent-bound commit and never force-updates main", async () => {
  const input = fixture();
  expect(await commitCanonicalData(input)).toEqual({ sha: "e".repeat(40) });
  expect(
    input.requests.find((request) =>
      request.args.includes("repos/Owner/Repo/git/commits"),
    )?.body.parents,
  ).toEqual([input.expectedMainSha]);
  expect(
    input.requests.find((request) => request.args.includes("PATCH"))?.body,
  ).toEqual({ sha: "e".repeat(40), force: false });
});

test("retirement deletes an exact hot record in the same parent-bound tree as its marker", async () => {
  const input = fixture();
  const path = `data/maintenance/automation/operations/${"a".repeat(64)}.json`;
  const original = input.gh.getMockImplementation()!;
  input.gh.mockImplementation(async (args, body) => {
    if (args[1]?.includes(`/contents/${path}?ref=`))
      return JSON.stringify({ type: "file", sha: "f".repeat(40) });
    return original(args, body);
  });
  expect(
    await commitCanonicalData({
      ...input,
      removeFiles: [{ path, gitBlobSha: "f".repeat(40) }],
    }),
  ).toEqual({ sha: "e".repeat(40) });
  const tree = input.requests.find((request) =>
    request.args.includes("repos/Owner/Repo/git/trees"),
  );
  expect(tree?.body.tree).toContainEqual({
    path,
    mode: "100644",
    type: "blob",
    sha: null,
  });
});
test.each(["tombstone", "changed-blob"])(
  "unsafe %s retirement cannot update main",
  async (variant) => {
    const input = fixture();
    const path =
      variant === "tombstone"
        ? "data/security/tombstones.json"
        : `data/maintenance/automation/operations/${"a".repeat(64)}.json`;
    await expect(
      commitCanonicalData({
        ...input,
        removeFiles: [{ path, gitBlobSha: "f".repeat(40) }],
      }),
    ).rejects.toThrow();
    expect(
      input.requests.some((request) => request.args.includes("PATCH")),
    ).toBe(false);
  },
);

test("the canonical Git adapter publishes and verifies the trusted refresh clock manifest", async () => {
  const input = fixture();
  const content = await readFile("data/snapshots/github-refresh.json", "utf8");
  input.files[0] = {
    ...input.files[0],
    path: "data/snapshots/github-refresh.json",
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
  const published = await commitCanonicalData(input);
  expect(published).toEqual({ sha: "e".repeat(40) });
  const tree = input.requests.find((request) =>
    request.args.includes("repos/Owner/Repo/git/trees"),
  );
  expect(tree?.body.tree).toEqual([
    {
      path: "data/snapshots/github-refresh.json",
      mode: "100644",
      type: "blob",
      sha: "c".repeat(40),
    },
  ]);
  expect(
    await verifyCanonicalData({
      ...input,
      sha: published.sha,
      mainSha: published.sha,
    }),
  ).toBe(true);
});
test("a concurrent main advance fails publication without retrying or forcing the same proposal", async () => {
  const input = fixture();
  const original = input.gh.getMockImplementation()!;
  input.gh.mockImplementation(async (args, body) => {
    if (args.includes("PATCH"))
      throw Object.assign(new Error("Reference update rejected."), {
        status: 422,
      });
    return original(args, body);
  });
  await expect(commitCanonicalData(input)).rejects.toMatchObject({
    code: "input-superseded",
  });
  expect(
    input.requests.filter((request) =>
      request.args.includes("repos/Owner/Repo/git/commits"),
    ),
  ).toHaveLength(1);
});
test.each(["workflow", "hash", "duplicate", "oversize"])(
  "canonical publication rejects invalid %s data before any GitHub write",
  async (variant) => {
    const input = fixture();
    if (variant === "workflow")
      input.files[0].path = ".github/workflows/ci.yml";
    if (variant === "hash") input.files[0].sha256 = "f".repeat(64);
    if (variant === "duplicate") input.files.push(input.files[0]);
    if (variant === "oversize") {
      input.files[0].content = "a".repeat(8_388_609);
      input.files[0].bytes = Buffer.byteLength(input.files[0].content);
      input.files[0].sha256 = createHash("sha256")
        .update(input.files[0].content)
        .digest("hex");
    }
    await expect(commitCanonicalData(input)).rejects.toThrow();
    expect(input.gh).not.toHaveBeenCalled();
  },
);
test("canonical proof requires ancestry and actual file bytes, not a returned commit identifier", async () => {
  const input = fixture();
  const proof = {
    gh: input.gh,
    repository: input.repository,
    sha: "e".repeat(40),
    mainSha: "f".repeat(40),
    files: input.files,
  };
  expect(await verifyCanonicalData(proof)).toBe(true);
  input.gh.mockResolvedValue(
    JSON.stringify({
      type: "file",
      encoding: "base64",
      content: Buffer.from("{}").toString("base64"),
    }),
  );
  expect(await verifyCanonicalData({ ...proof, mainSha: proof.sha })).toBe(
    false,
  );
});

test("canonical proof verifies large Contents API files through their pinned Git blob", async () => {
  const input = fixture();
  const sha = "a".repeat(40);
  const blobSha = "c".repeat(40);
  input.gh.mockImplementation(async (args) =>
    args[1]?.includes("/contents/")
      ? JSON.stringify({ type: "file", encoding: "none", sha: blobSha })
      : JSON.stringify({
          sha: blobSha,
          encoding: "base64",
          size: input.files[0].bytes,
          content: Buffer.from(input.files[0].content).toString("base64"),
        }),
  );
  const proof = { ...input, sha, mainSha: sha };
  expect(await verifyCanonicalData(proof)).toBe(true);
  expect(
    input.gh.mock.calls.some(
      ([args]) => args[1] === `repos/Owner/Repo/git/blobs/${blobSha}`,
    ),
  ).toBe(true);
  input.gh.mockImplementation(async (args) =>
    args[1]?.includes("/contents/")
      ? JSON.stringify({ type: "file", encoding: "none", sha: blobSha })
      : JSON.stringify({
          sha: "d".repeat(40),
          encoding: "base64",
          content: Buffer.from(input.files[0].content).toString("base64"),
        }),
  );
  expect(await verifyCanonicalData(proof)).toBe(false);
});

test("canonical proof verifies a generated catalog above eight MiB through wrapped base64", async () => {
  const input = fixture();
  const content = JSON.stringify({ projects: "x".repeat(12_000_000) });
  input.files[0] = {
    ...input.files[0],
    path: "public/catalog/tavernary-catalog-v8.json",
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
  const blobSha = "c".repeat(40);
  input.gh.mockImplementation(async (args) => {
    if (args[1]?.includes("/contents/"))
      return JSON.stringify({ type: "file", encoding: "none", sha: blobSha });
    if (args[1] !== `repos/Owner/Repo/git/blobs/${blobSha}`)
      throw new Error("Unexpected proof request.");
    return JSON.stringify({
      sha: blobSha,
      size: input.files[0].bytes,
      encoding: "base64",
      content: Buffer.from(content)
        .toString("base64")
        .replace(/.{60}/gu, "$&\r\n"),
    });
  });
  expect(
    await verifyCanonicalData({
      ...input,
      sha: "a".repeat(40),
      mainSha: "a".repeat(40),
    }),
  ).toBe(true);
});
