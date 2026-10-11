import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runAutomationWriterCli } from "../../scripts/automation/writer-cli.mjs";

const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR_ID: "2625904",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
};
const nowMs = Date.parse("2026-10-10T12:00:00Z");
test("shared cooldown defers every writer mode before discovery", async () => {
  let invoked = false;
  const output: string[] = [];
  const code = await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    loadCooldown: async () => ({
      schemaVersion: 1,
      nextEligibleAt: "2026-10-10T13:00:00.000Z",
      reason: "github-rate-limit",
    }),
    persistCooldown: async () => {},
    handlers: {
      reconcile: async () => {
        invoked = true;
        return {};
      },
    },
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(invoked).toBe(false);
  expect(JSON.parse(output[0])).toEqual({
    status: "waiting",
    reason: "github-rate-limit",
    nextEligibleAt: "2026-10-10T13:00:00.000Z",
  });
});

test("a rate limit during initial discovery becomes a durable shared cooldown", async () => {
  const output: string[] = [];
  let saved: unknown;
  let requests = 0;
  const code = await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    loadCooldown: async () => null,
    persistCooldown: async (value) => {
      saved = value;
    },
    gh: async () => {
      requests++;
      throw Object.assign(new Error("secondary rate limit (HTTP 403)"), {
        headers: { "retry-after": "120" },
      });
    },
    handlers: {
      reconcile: async (_inputs, gh) => {
        await gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]);
        return {};
      },
    },
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(requests).toBe(1);
  expect(saved).toEqual({
    schemaVersion: 1,
    reason: "github-rate-limit",
    nextEligibleAt: "2026-10-10T12:02:00.000Z",
  });
  expect(JSON.parse(output[0])).toMatchObject({
    status: "waiting",
    reason: "github-rate-limit",
  });
});

test("request exhaustion stops a pass without more GitHub calls or an operation retry", async () => {
  let requests = 0;
  let persisted = false;
  const output: string[] = [];
  const code = await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    requestLimit: 2,
    loadCooldown: async () => null,
    persistCooldown: async () => {
      persisted = true;
    },
    gh: async () => {
      requests++;
      return "{}";
    },
    handlers: {
      reconcile: async (_inputs, gh) => {
        for (let i = 0; i < 5; i++) {
          try {
            await gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]);
          } catch {
            /* A maintenance lane can catch its own failure. */
          }
        }
        return {};
      },
    },
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(requests).toBe(2);
  expect(persisted).toBe(false);
  expect(JSON.parse(output[0])).toMatchObject({
    status: "waiting",
    reason: "github-request-budget",
  });
});

test("cooldown persists through authenticated fast-forward git when REST is exhausted", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer-cooldown-"));
  const commands: string[][] = [];
  const output: string[] = [];
  try {
    const code = await runAutomationWriterCli({
      root,
      env: { ...env, GH_TOKEN: "fixture-token" },
      event: { inputs: { mode: "reconcile" } },
      nowMs,
      loadCooldown: async () => null,
      run: async (_command, args) => {
        commands.push(args);
        return "";
      },
      gh: async () => {
        throw new Error("secondary rate limit (HTTP 403)");
      },
      handlers: {
        reconcile: async (_inputs, gh) => {
          await gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]);
        },
      },
      write: (value) => output.push(value),
    });
    expect(code).toBe(0);
    expect(
      JSON.parse(
        await readFile(
          join(root, "data/maintenance/automation/github-backoff.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      schemaVersion: 1,
      reason: "github-rate-limit",
      nextEligibleAt: "2026-10-10T12:05:00.000Z",
    });
    expect(commands.find((args) => args[0] === "add")).toEqual([
      "add",
      "--",
      "data/maintenance/automation/github-backoff.json",
    ]);
    expect(commands.find((args) => args[0] === "push")).toEqual([
      "push",
      "https://github.com/MentallyQuill/Tavernary.git",
      "HEAD:refs/heads/main",
    ]);
    expect(commands.flat().join(" ")).not.toContain("fixture-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("primary exhaustion probes reset once and then blocks caught retries", async () => {
  let requests = 0;
  let saved: unknown;
  const output: string[] = [];
  await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    loadCooldown: async () => null,
    persistCooldown: async (value) => {
      saved = value;
    },
    gh: async (args) => {
      requests++;
      if (args[1] === "rate_limit")
        return JSON.stringify({
          resources: { core: { remaining: 0, reset: 1791635400 } },
        });
      throw new Error("API rate limit exceeded (HTTP 403)");
    },
    handlers: {
      reconcile: async (_inputs, gh) => {
        for (let i = 0; i < 3; i++) {
          try {
            await gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]);
          } catch {
            /* caught lane failures must not retry GitHub */
          }
        }
        return {};
      },
    },
    write: (value) => output.push(value),
  });
  expect(requests).toBe(2);
  expect(saved).toEqual({
    schemaVersion: 1,
    reason: "github-rate-limit",
    nextEligibleAt: "2026-10-10T12:30:00.000Z",
  });
});

test("a synchronized later cooldown avoids a duplicate commit after a lost response", async () => {
  const { persistGithubBackoff } =
    await import("../../scripts/automation/github-backoff.mjs");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "writer-cooldown-"));
  const commands: string[][] = [];
  try {
    await mkdir(join(root, "data/maintenance/automation"), { recursive: true });
    await writeFile(
      join(root, "data/maintenance/automation/github-backoff.json"),
      JSON.stringify({
        schemaVersion: 1,
        reason: "github-rate-limit",
        nextEligibleAt: "2026-10-10T13:00:00.000Z",
      }),
    );
    await persistGithubBackoff({
      root,
      env: { ...env, GH_TOKEN: "fixture" },
      cooldown: {
        schemaVersion: 1,
        reason: "github-rate-limit",
        nextEligibleAt: "2026-10-10T12:05:00.000Z",
      },
      run: async (_command, args) => {
        commands.push(args);
        return "";
      },
    });
    expect(
      commands.some(
        (args) =>
          args.includes("commit") || args[0] === "add" || args[0] === "push",
      ),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plain permission 403 fails without a shared cooldown", async () => {
  let persisted = false;
  const output: string[] = [];
  expect(
    await runAutomationWriterCli({
      env,
      event: { inputs: { mode: "reconcile" } },
      nowMs,
      loadCooldown: async () => null,
      persistCooldown: async () => {
        persisted = true;
      },
      gh: async () => {
        throw new Error("Resource not accessible by integration (HTTP 403)");
      },
      handlers: {
        reconcile: async (_inputs, gh) =>
          gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]),
      },
      write: (value) => output.push(value),
    }),
  ).toBe(1);
  expect(persisted).toBe(false);
  expect(JSON.parse(output[0])).toMatchObject({
    status: "unavailable",
    diagnostic: { httpStatus: 403, githubRateLimited: false },
  });
});
test("expired cooldown permits fresh work and an untrusted writer cannot mutate cooldown", async () => {
  let invoked = false,
    persisted = false;
  const options = {
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    loadCooldown: async () => ({
      schemaVersion: 1 as const,
      reason: "github-rate-limit" as const,
      nextEligibleAt: "2026-10-10T11:59:00.000Z",
    }),
    persistCooldown: async () => {
      persisted = true;
    },
    handlers: {
      reconcile: async () => {
        invoked = true;
        return {};
      },
    },
    write: () => {},
  };
  expect(await runAutomationWriterCli(options)).toBe(0);
  expect(invoked).toBe(true);
  invoked = false;
  expect(
    await runAutomationWriterCli({
      ...options,
      env: {
        ...env,
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/foreign.yml@refs/heads/main",
      },
    }),
  ).toBe(1);
  expect(invoked).toBe(false);
  expect(persisted).toBe(false);
});
test("rate-limit response dates and reset headers retain their authoritative eligibility", async () => {
  let saved: unknown;
  await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "retain" } },
    nowMs,
    loadCooldown: async () => null,
    persistCooldown: async (value) => {
      saved = value;
    },
    gh: async () => {
      throw Object.assign(new Error("HTTP 429"), {
        headers: { "Retry-After": "Sat, 10 Oct 2026 12:02:30 GMT" },
      });
    },
    handlers: {
      retain: async (_inputs, gh) =>
        gh!(["api", "repos/MentallyQuill/Tavernary/actions/runs"]),
    },
    write: () => {},
  });
  expect(saved).toEqual({
    schemaVersion: 1,
    reason: "github-rate-limit",
    nextEligibleAt: "2026-10-10T12:02:30.000Z",
  });
});

test("a writer refreshes trusted main before reading the shared cooldown", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "writer-cooldown-"));
  let invoked = false,
    requests = 0;
  const output: string[] = [];
  try {
    const code = await runAutomationWriterCli({
      root,
      env: { ...env, GH_TOKEN: "fixture" },
      event: { inputs: { mode: "reconcile" } },
      nowMs,
      run: async (_command, args) => {
        if (args[0] === "checkout") {
          await mkdir(join(root, "data/maintenance/automation"), {
            recursive: true,
          });
          await writeFile(
            join(root, "data/maintenance/automation/github-backoff.json"),
            JSON.stringify({
              schemaVersion: 1,
              reason: "github-rate-limit",
              nextEligibleAt: "2026-10-10T13:00:00.000Z",
            }),
          );
        }
        return "";
      },
      gh: async () => {
        requests++;
        return "{}";
      },
      handlers: {
        reconcile: async () => {
          invoked = true;
          return {};
        },
      },
      write: (value) => output.push(value),
    });
    expect(code).toBe(0);
    expect(invoked).toBe(false);
    expect(requests).toBe(0);
    expect(JSON.parse(output[0])).toMatchObject({
      status: "waiting",
      nextEligibleAt: "2026-10-10T13:00:00.000Z",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("binary diagnostic rate limits share the request budget and durable cooldown", async () => {
  let downloaded = 0,
    saved: unknown;
  const output: string[] = [];
  const code = await runAutomationWriterCli({
    env,
    event: { inputs: { mode: "reconcile" } },
    nowMs,
    loadCooldown: async () => null,
    persistCooldown: async (value) => {
      saved = value;
    },
    gh: async () => "{}",
    download: async () => {
      downloaded++;
      throw Object.assign(new Error("secondary rate limit (HTTP 403)"), {
        headers: { "retry-after": "420" },
      });
    },
    handlers: {
      reconcile: async (_inputs, gh) => {
        try {
          await gh!.download([
            "api",
            "repos/MentallyQuill/Tavernary/actions/artifacts/900/zip",
          ]);
        } catch {
          /* inventory may sanitize an artifact error */
        }
        return {};
      },
    },
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(downloaded).toBe(1);
  expect(saved).toEqual({
    schemaVersion: 1,
    reason: "github-rate-limit",
    nextEligibleAt: "2026-10-10T12:07:00.000Z",
  });
  expect(JSON.parse(output[0])).toMatchObject({
    status: "waiting",
    reason: "github-rate-limit",
  });
});
