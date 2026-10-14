import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { parse } from "yaml";

function fixture() {
  const path = ".github/workflows/publication-settings-reader-verification.yml";
  expect(existsSync(path), "dedicated settings reader workflow exists").toBe(
    true,
  );
  const source = readFileSync(path, "utf8");
  return { source, workflow: parse(source) };
}

function probeScript() {
  const { source, workflow } = fixture();
  const steps = workflow.jobs.verify.steps;
  expect(steps).toHaveLength(1);
  expect(steps[0].env).toEqual({
    TAVERNARY_PUBLICATION_SETTINGS_PAT:
      "${{ secrets.TAVERNARY_PUBLICATION_SETTINGS_PAT }}",
  });
  expect(steps[0]["continue-on-error"]).toBeUndefined();
  expect(source).not.toMatch(
    /actions\/checkout|create-github-app-token|npm |writer-cli|workflow run|UTILITY_|TAVERNARY_ENRICHMENT_|git (?:push|commit)|writeFile|process\.argv|fetch\(|\.length|\.slice\(|\.substring\(/u,
  );
  const match = steps[0].run.trim().match(/^node <<'NODE'\n([\s\S]*)\nNODE$/u);
  expect(match).not.toBeNull();
  return match![1];
}

test("only the owner on main can dispatch the isolated settings-reader verification", () => {
  const { workflow } = fixture();
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch?.inputs).toBeUndefined();
  expect(workflow.permissions).toEqual({});
  expect(workflow.concurrency).toEqual({
    group: "publication-settings-reader-verification",
    "cancel-in-progress": false,
  });
  const job = workflow.jobs.verify;
  expect(job.environment).toBe("publisher");
  expect(job["timeout-minutes"]).toBe(5);
  for (const [ref, actor, allowed] of [
    ["refs/heads/main", "2625904", true],
    ["refs/heads/other", "2625904", false],
    ["refs/heads/main", "999", false],
  ] as const)
    expect(runInNewContext(job.if, { github: { ref, actor_id: actor } })).toBe(
      allowed,
    );
});

const credential = "opaque.private.credential-marker-with-no-format-contract";
type ChildResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: { code?: string };
  signal?: string | null;
};
type Call = {
  executable: string;
  args: string[];
  options: {
    env: Record<string, string | undefined>;
    encoding: string;
    timeout: number;
    killSignal: string;
    maxBuffer: number;
    windowsHide: boolean;
  };
};

function executeProbe(
  result: ChildResult = { status: 0, stdout: "true\n", stderr: "" },
  reader: { value?: string } = { value: credential },
  throwOnSpawn = false,
) {
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: Call[] = [];
  const process = {
    env: {
      TAVERNARY_PUBLICATION_SETTINGS_PAT: reader.value,
      GH_TOKEN: "unrelated-broad-gh-token",
      GITHUB_TOKEN: "unrelated-broad-github-token",
      GH_ENTERPRISE_TOKEN: "unrelated-enterprise-token",
      GITHUB_ENTERPRISE_TOKEN: "unrelated-github-enterprise-token",
      GH_HOST: "untrusted.example",
      GH_DEBUG: "api",
      PATH: "preserved-path",
    },
    exitCode: 0,
  };
  const originalEnv = { ...process.env };
  runInNewContext(
    probeScript(),
    {
      process,
      require: (module: string) => {
        expect(module).toBe("node:child_process");
        return {
          spawnSync: (
            executable: string,
            args: string[],
            options: Call["options"],
          ) => {
            calls.push({ executable, args, options });
            if (throwOnSpawn) throw new Error(`${credential}: raw spawn error`);
            return result;
          },
        };
      },
      console: {
        log: (message: string) => logs.push(message),
        error: (message: string) => errors.push(message),
      },
    },
    { timeout: 1000 },
  );
  expect(process.env).toEqual(originalEnv);
  const output = [...logs, ...errors].join("\n");
  for (const secret of [
    credential,
    "unrelated-broad-gh-token",
    "unrelated-broad-github-token",
    "unrelated-enterprise-token",
    "unrelated-github-enterprise-token",
    "raw spawn error",
    "raw-secret-body",
  ])
    expect(output).not.toContain(secret);
  for (const call of calls) {
    expect(call.executable).toBe("gh");
    expect(call.args).toEqual([
      "api",
      "--method",
      "GET",
      "repos/MentallyQuill/Tavernary/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED",
      "--jq",
      '.value == "true"',
    ]);
    expect(call.options.env.GH_TOKEN).toBe(reader.value);
    expect(call.options.env.GH_HOST).toBe("github.com");
    expect(call.options.env.PATH).toBe("preserved-path");
    expect(call.options.env.GH_DEBUG).toBeUndefined();
    expect(call.options.env.GITHUB_TOKEN).toBeUndefined();
    expect(call.options.env.GH_ENTERPRISE_TOKEN).toBeUndefined();
    expect(call.options.env.GITHUB_ENTERPRISE_TOKEN).toBeUndefined();
    expect(call.options.env.TAVERNARY_PUBLICATION_SETTINGS_PAT).toBeUndefined();
    expect(call.options.encoding).toBe("utf8");
    expect(call.options.timeout).toBe(15000);
    expect(call.options.killSignal).toBe("SIGKILL");
    expect(call.options.maxBuffer).toBe(65536);
    expect(call.options.windowsHide).toBe(true);
    expect(JSON.stringify(call.args)).not.toContain(credential);
  }
  return { logs, errors, calls, process };
}

test("a fresh true setting permits the probe and prints only a safe boolean", () => {
  const result = executeProbe();
  expect(result.process.exitCode).toBe(0);
  expect(result.calls).toHaveLength(1);
  expect(result.logs).toEqual(["true"]);
  expect(result.errors).toEqual([]);
});

test.each(["false", "false\n"])(
  "a false setting fails closed instead of enabling publication",
  (stdout) => {
    const result = executeProbe({ status: 0, stdout, stderr: "" });
    expect(result.process.exitCode).toBe(1);
    expect(result.logs).toEqual([]);
    expect(result.errors.map((line) => JSON.parse(line))).toEqual([
      {
        event: "publication-settings-reader-failed",
        reason: "publication-disabled",
      },
    ]);
  },
);

test.each(["", "null\n", "TRUE\n", "true\nraw-secret-body", '"true"\n'])(
  "malformed or credential-bearing stdout is suppressed and fails closed",
  (stdout) => {
    const result = executeProbe({ status: 0, stdout, stderr: "" });
    expect(result.process.exitCode).toBe(1);
    expect(result.logs).toEqual([]);
    expect(JSON.parse(result.errors[0]).reason).toBe(
      "invalid-setting-response",
    );
  },
);

test.each([undefined, ""])(
  "a missing dedicated credential does not fall back to broader credentials",
  (reader) => {
    const result = executeProbe(undefined, { value: reader });
    expect(result.process.exitCode).toBe(1);
    expect(result.calls).toEqual([]);
    expect(JSON.parse(result.errors[0]).reason).toBe("missing-settings-reader");
  },
);

test.each([401, 403, 404, 422, 429, 500])(
  "HTTP %s errors expose only the numeric status and a fixed failure reason",
  (status) => {
    const result = executeProbe({
      status: 1,
      stdout: `${credential}: raw-secret-body`,
      stderr: `gh: ${credential} raw-secret-body (HTTP ${status})`,
    });
    expect(result.process.exitCode).toBe(1);
    expect(result.logs).toEqual([]);
    expect(result.errors.map((line) => JSON.parse(line))).toEqual([
      {
        event: "publication-settings-reader-failed",
        reason: "request-failed",
        status,
      },
    ]);
  },
);

test("a timed-out child cannot report a successful read even with true stdout", () => {
  const result = executeProbe({
    status: null,
    stdout: "true\n",
    stderr: `${credential}: raw-secret-body`,
    error: { code: "ETIMEDOUT" },
    signal: "SIGKILL",
  });
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(JSON.parse(result.errors[0]).reason).toBe("request-timeout");
});

test.each([
  { status: null, stdout: "true", stderr: "", signal: "SIGTERM" },
  { status: 1, stdout: "true", stderr: "raw-secret-body" },
  { status: 0, stdout: "true", stderr: "", error: { code: "ENOENT" } },
])("other child-process failures cannot become a successful probe", (child) => {
  const result = executeProbe(child);
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(JSON.parse(result.errors[0]).reason).toBe("request-failed");
});

test("a thrown credential-bearing process error is suppressed and fails closed", () => {
  const result = executeProbe(undefined, { value: credential }, true);
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(JSON.parse(result.errors[0]).reason).toBe("request-failed");
});
