import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import {
  runRepositoryIdentityWriter,
  runPublisherWriterVerification,
} from "../../scripts/automation/maintenance-writer.mjs";
import type { IdentityWriterState } from "../../scripts/automation/maintenance-writer.mjs";

const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR_ID: "2625904",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
};
function state(): IdentityWriterState {
  return {
    revision: "a".repeat(40),
    sources: [
      {
        id: "github-42",
        type: "github",
        repository: "Example/Project",
        repository_id: null,
        status: "withdrawn",
        refresh_policy: "manual",
      },
    ],
    snapshots: [
      {
        source_id: "github-42",
        source_health: "healthy",
        repository: { id: 42, owner: "Example", name: "Project" },
      },
    ],
  };
}

test("identity maintenance requests only actions permission and delegates every main write", async () => {
  const document = parse(
    await readFile(
      ".github/workflows/backfill-repository-identities.yml",
      "utf8",
    ),
  );
  const steps = document.jobs.backfill.steps;
  const token = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/create-github-app-token@"),
  );
  const checkout = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  expect(token.with["permission-actions"]).toBe("write");
  expect(token.with["permission-contents"]).toBeUndefined();
  expect(checkout.with).toMatchObject({
    ref: "main",
    "persist-credentials": false,
  });
  expect(
    steps.map((step: { run?: string }) => step.run ?? "").join("\n"),
  ).toContain("mode=backfill-identities");
  expect(JSON.stringify(document)).not.toMatch(/git (?:push|commit|rebase)/u);
});

test.each([
  "publisher-verification",
  "publisher-automation-branch-verification",
])(
  "%s forwards authenticated owner intent with dispatch-only credentials",
  async (name) => {
    const document = parse(
      await readFile(`.github/workflows/${name}.yml`, "utf8"),
    );
    const job = document.jobs.verify;
    const token = job.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("actions/create-github-app-token@"),
    );
    const dispatch = job.steps.find((step: { run?: string }) =>
      step.run?.includes("gh workflow run"),
    );
    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' && github.actor_id == 2625904",
    );
    expect(token.with["permission-actions"]).toBe("write");
    expect(token.with["permission-contents"]).toBeUndefined();
    expect(dispatch.run).toContain("automation-writer.yml --ref main");
    expect(dispatch.run).toContain("mode=verify-publisher");
    expect(dispatch.env.REQUEST_RUN_ID).toBe("${{ github.run_id }}");
    expect(JSON.stringify(document)).not.toMatch(
      /git (?:commit|push|rebase)|--method (?:POST|PATCH|DELETE)/u,
    );
  },
);

test("identity backfill uses a current CAS publication and survives a lost commit response", async () => {
  const current = state();
  const commits: Array<{
    expectedMainSha: string;
    files: Array<{ path: string; content: string }>;
  }> = [];
  const input = {
    env,
    load: async () => structuredClone(current),
    validate: async () => ({ errors: [] }),
    commit: async (publication: {
      expectedMainSha: string;
      files: Array<{ path: string; content: string }>;
    }) => {
      commits.push(publication);
      current.sources = [JSON.parse(publication.files[0].content)];
      current.revision = "b".repeat(40);
      throw new Error("response lost after successful ref update");
    },
  };
  await expect(runRepositoryIdentityWriter(input)).rejects.toThrow(
    "response lost",
  );
  expect(commits[0].expectedMainSha).toBe("a".repeat(40));
  expect(commits[0].files.map((file) => file.path)).toEqual([
    "data/registry/sources/github-42.json",
  ]);
  expect(JSON.parse(commits[0].files[0].content)).toEqual({
    ...state().sources[0],
    repository_id: 42,
  });
  expect(await runRepositoryIdentityWriter(input)).toEqual({
    status: "unchanged",
    changed: 0,
  });
  expect(commits).toHaveLength(1);
});

test("Publisher write verification requires the actual owner request and publishes an empty tree change", async () => {
  const calls: string[][] = [];
  const parent = "a".repeat(40),
    tree = "c".repeat(40),
    probe = "d".repeat(40);
  const request = {
    id: 88,
    path: ".github/workflows/publisher-verification.yml",
    actor: { id: 2625904 },
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: parent,
    head_repository: { full_name: env.GITHUB_REPOSITORY },
  };
  let actor = 2625904;
  const gh = async (args: string[], body?: string) => {
    calls.push(args);
    if (args[1].endsWith("/actions/runs/88"))
      return JSON.stringify({ ...request, actor: { id: actor } });
    if (args[1].endsWith("/git/ref/heads/main"))
      return JSON.stringify({
        ref: "refs/heads/main",
        object: { sha: parent },
      });
    if (args[1].endsWith(`/git/commits/${parent}`))
      return JSON.stringify({ sha: parent, tree: { sha: tree } });
    if (args.includes("POST")) {
      expect(JSON.parse(body!)).toMatchObject({ tree, parents: [parent] });
      return JSON.stringify({ sha: probe });
    }
    if (args.includes("PATCH")) {
      expect(JSON.parse(body!)).toEqual({ sha: probe, force: false });
      return JSON.stringify({ ref: "refs/heads/main", object: { sha: probe } });
    }
    throw new Error("Unexpected API effect");
  };
  actor = 4624827;
  await expect(
    runPublisherWriterVerification({ env, runId: 88, gh }),
  ).rejects.toThrow("owner");
  expect(calls).toHaveLength(1);
  actor = 2625904;
  expect(await runPublisherWriterVerification({ env, runId: 88, gh })).toEqual({
    status: "verified",
    sha: probe,
    lane: "main",
  });
});

test("the owner branch probe tests create, advance and delete without touching main", async () => {
  const parent = "a".repeat(40),
    tree = "c".repeat(40),
    base = "d".repeat(40),
    tip = "e".repeat(40);
  const branch = "automation/project-submission-0-89";
  const effects: string[] = [];
  let exists = false;
  const gh = async (args: string[], body?: string) => {
    const endpoint = args[1];
    if (endpoint.endsWith("/actions/runs/89"))
      return JSON.stringify({
        id: 89,
        actor: { id: 2625904 },
        path: ".github/workflows/publisher-automation-branch-verification.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: parent,
        head_repository: { full_name: env.GITHUB_REPOSITORY },
      });
    if (endpoint.endsWith("/git/ref/heads/main"))
      return JSON.stringify({
        ref: "refs/heads/main",
        object: { sha: parent },
      });
    if (endpoint.endsWith(`/git/commits/${parent}`))
      return JSON.stringify({ sha: parent, tree: { sha: tree } });
    if (endpoint.endsWith(`/git/ref/heads/${branch}`)) {
      if (!exists) throw Object.assign(new Error("not found"), { status: 404 });
      return JSON.stringify({
        ref: `refs/heads/${branch}`,
        object: { sha: tip },
      });
    }
    if (args.includes("POST") && endpoint.endsWith("/git/commits")) {
      const input = JSON.parse(body!);
      expect(input.tree).toBe(tree);
      effects.push("commit");
      return JSON.stringify({ sha: input.parents[0] === parent ? base : tip });
    }
    if (args.includes("POST") && endpoint.endsWith("/git/refs")) {
      expect(JSON.parse(body!)).toEqual({
        ref: `refs/heads/${branch}`,
        sha: base,
      });
      exists = true;
      effects.push("create");
      return JSON.stringify({
        ref: `refs/heads/${branch}`,
        object: { sha: base },
      });
    }
    if (args.includes("PATCH")) {
      expect(endpoint).toContain(`/git/refs/heads/${branch}`);
      expect(JSON.parse(body!)).toEqual({ sha: tip, force: false });
      effects.push("advance");
      return JSON.stringify({
        ref: `refs/heads/${branch}`,
        object: { sha: tip },
      });
    }
    if (args.includes("DELETE")) {
      effects.push("delete");
      exists = false;
      return "";
    }
    throw new Error("Unexpected API effect");
  };
  expect(await runPublisherWriterVerification({ env, runId: 89, gh })).toEqual({
    status: "verified",
    lane: "branch",
    sha: tip,
  });
  expect(effects).toEqual(["commit", "create", "commit", "advance", "delete"]);
  expect(exists).toBe(false);
});

test("a lost main-probe response recovers its empty commit without publishing again", async () => {
  const parent = "a".repeat(40),
    tree = "c".repeat(40),
    probe = "d".repeat(40);
  const message =
    "chore(security): verify Publisher write lane (owner request 90)";
  let main = parent,
    published = 0;
  const gh = async (args: string[], body?: string) => {
    const path = args[1];
    if (path.endsWith("/actions/runs/90"))
      return JSON.stringify({
        id: 90,
        actor: { id: 2625904 },
        path: ".github/workflows/publisher-verification.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: parent,
        head_repository: { full_name: env.GITHUB_REPOSITORY },
      });
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ ref: "refs/heads/main", object: { sha: main } });
    if (path.endsWith(`/git/commits/${parent}`))
      return JSON.stringify({
        sha: parent,
        tree: { sha: tree },
        message: "prior publication",
        parents: [],
      });
    if (path.endsWith(`/git/commits/${probe}`))
      return JSON.stringify({
        sha: probe,
        tree: { sha: tree },
        message,
        parents: [{ sha: parent }],
      });
    if (args.includes("POST")) {
      published++;
      return JSON.stringify({ sha: probe });
    }
    if (args.includes("PATCH")) {
      expect(JSON.parse(body!)).toEqual({ sha: probe, force: false });
      main = probe;
      throw new Error("response lost after ref update");
    }
    throw new Error("Unexpected API effect");
  };
  await expect(
    runPublisherWriterVerification({ env, runId: 90, gh }),
  ).rejects.toThrow("response lost");
  expect(await runPublisherWriterVerification({ env, runId: 90, gh })).toEqual({
    status: "verified",
    lane: "main",
    sha: probe,
  });
  expect(published).toBe(1);
});

test("identity conflicts, unknown selectors and advancing main produce no canonical write", async () => {
  let current = state(),
    loads = 0,
    writes = 0;
  const input = {
    env,
    load: async () => {
      loads++;
      return structuredClone(current);
    },
    validate: async () => ({ errors: [] }),
    commit: async () => {
      writes++;
      return { sha: "b".repeat(40) };
    },
  };
  await expect(
    runRepositoryIdentityWriter({ ...input, sourceIds: "unknown-source" }),
  ).rejects.toThrow("unknown");
  current.sources[0].repository_id = 99;
  await expect(runRepositoryIdentityWriter(input)).rejects.toThrow("conflicts");
  current = state();
  loads = 0;
  const raced = await runRepositoryIdentityWriter({
    ...input,
    load: async () => {
      loads++;
      const observed = structuredClone(current);
      if (loads === 2) observed.revision = "b".repeat(40);
      return observed;
    },
  });
  expect(raced).toEqual({ status: "superseded", changed: 0 });
  expect(writes).toBe(0);
});
