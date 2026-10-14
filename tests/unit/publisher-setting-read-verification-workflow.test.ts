import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { parse } from "yaml";

function fixture() {
  const path = ".github/workflows/publisher-setting-read-verification.yml";
  expect(existsSync(path)).toBe(true);
  const source = readFileSync(path, "utf8");
  return { source, workflow: parse(source) };
}

test("only an explicit owner dispatch on main can run the isolated permission probe", () => {
  const { workflow } = fixture();
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch?.inputs).toBeUndefined();
  expect(workflow.permissions).toEqual({});
  expect(workflow.concurrency).toEqual({
    group: "publisher-setting-read-verification",
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
    expect(
      runInNewContext(
        job.if,
        { github: { ref, actor_id: actor } },
        { timeout: 1000 },
      ),
    ).toBe(allowed);
});

test("the probe requests only App Variables read permission for the current repository", () => {
  const { workflow } = fixture();
  const [diagnostic, token, read] = workflow.jobs.verify.steps;
  expect(workflow.jobs.verify.steps).toHaveLength(3);
  expect(diagnostic.name).toBe("Inspect current Publisher installation grants");
  expect(token.uses).toBe(
    "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
  );
  expect(token.with).toEqual({
    "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
    "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
    owner: "${{ github.repository_owner }}",
    repositories: "${{ github.event.repository.name }}",
    "permission-actions-variables": "read",
  });
  expect(token["continue-on-error"]).toBeUndefined();
  expect(read["continue-on-error"]).toBeUndefined();
  expect(read.env).toEqual({
    GH_TOKEN: "${{ steps.reader-token.outputs.token }}",
  });
});

test("the native probe reads only the fixed publication switch and emits a boolean", () => {
  const { source, workflow } = fixture();
  const read = workflow.jobs.verify.steps[2];
  expect(read.run.trim()).toBe(
    'gh api --method GET "repos/${GITHUB_REPOSITORY}/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED" --jq \'.value == "true"\'',
  );
  expect(source).not.toMatch(
    /actions\/checkout|npm |writer-cli|workflow run|UTILITY_|TAVERNARY_ENRICHMENT_|git (?:push|commit)|--method (?:POST|PUT|PATCH|DELETE)/u,
  );
  expect(read.run).not.toMatch(
    /GH_TOKEN|GITHUB_TOKEN|PRIVATE_KEY|printenv|echo|console\.log/u,
  );
});

function installationDiagnostic() {
  const { workflow } = fixture();
  const diagnostic = workflow.jobs.verify.steps[0];
  expect(diagnostic.name).toBe("Inspect current Publisher installation grants");
  expect(diagnostic.env).toEqual({
    PUBLISHER_CLIENT_ID: "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
    PUBLISHER_PRIVATE_KEY: "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
  });
  expect(diagnostic["continue-on-error"]).toBeUndefined();
  const match = diagnostic.run
    .trim()
    .match(/^node <<'NODE'\n([\s\S]*)\nNODE$/u);
  expect(match).not.toBeNull();
  return match![1];
}

const diagnosticKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const diagnosticPrivateKey = diagnosticKey.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

type DiagnosticResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

async function executeInstallationDiagnostic(
  respond: (url: string, options: RequestInit) => Promise<DiagnosticResponse>,
) {
  const logs: string[] = [];
  const errors: string[] = [];
  const requests: { url: string; options: RequestInit }[] = [];
  const process = {
    env: {
      PUBLISHER_CLIENT_ID: "Iv1.test_client",
      PUBLISHER_PRIVATE_KEY: diagnosticPrivateKey,
    },
    exitCode: 0,
  };
  const timeoutSignal = {};
  const timeoutDurations: number[] = [];
  await runInNewContext(
    installationDiagnostic(),
    {
      Buffer,
      process,
      require: (module: string) => {
        expect(module).toBe("node:crypto");
        return { sign };
      },
      AbortSignal: {
        timeout: (duration: number) => {
          timeoutDurations.push(duration);
          return timeoutSignal;
        },
      },
      console: {
        log: (message: string) => logs.push(message),
        error: (message: string) => errors.push(message),
      },
      fetch: async (url: string, options: RequestInit) => {
        requests.push({ url, options });
        return respond(url, options);
      },
    },
    { timeout: 1000 },
  );
  return { logs, errors, requests, process, timeoutDurations, timeoutSignal };
}

test("the diagnostic uses an in-memory five-minute App JWT for one fixed read and emits only installation metadata", async () => {
  const before = Math.floor(Date.now() / 1000);
  const result = await executeInstallationDiagnostic(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 154417139,
      app_id: 123456,
      account: { login: "MentallyQuill", secret: "untrusted-extra-field" },
      permissions: {
        actions: "write",
        variables: "read",
        "unsafe\npermission": "read",
        ignored: "untrusted-extra-field",
      },
      secret: "untrusted-extra-field",
    }),
  }));
  const after = Math.floor(Date.now() / 1000);
  expect(result.requests).toHaveLength(1);
  const { url, options } = result.requests[0];
  expect(url).toBe(
    "https://api.github.com/repos/MentallyQuill/Tavernary/installation",
  );
  expect(options.method).toBe("GET");
  expect(options.redirect).toBe("error");
  expect(options.signal).toBe(result.timeoutSignal);
  expect(result.timeoutDurations).toEqual([15000]);
  const headers = options.headers as Record<string, string>;
  expect(headers.Accept).toBe("application/vnd.github+json");
  expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  expect(headers["User-Agent"]).toBe("Tavernary-Publisher-Installation-Probe");
  expect(headers.Authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/u);
  const jwt = headers.Authorization.slice("Bearer ".length);
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
  expect(
    JSON.parse(Buffer.from(encodedHeader, "base64url").toString()),
  ).toEqual({
    alg: "RS256",
    typ: "JWT",
  });
  const claims = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString(),
  );
  expect(claims.iss).toBe("Iv1.test_client");
  expect(claims.iat).toBeGreaterThanOrEqual(before - 60);
  expect(claims.iat).toBeLessThanOrEqual(after - 60);
  expect(claims.exp).toBeGreaterThanOrEqual(before + 300);
  expect(claims.exp).toBeLessThanOrEqual(after + 300);
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      diagnosticKey.publicKey,
      Buffer.from(encodedSignature, "base64url"),
    ),
  ).toBe(true);
  expect(result.process.exitCode).toBe(0);
  expect(result.errors).toEqual([]);
  expect(result.logs.map((line) => JSON.parse(line))).toEqual([
    {
      installation_id: 154417139,
      app_id: 123456,
      account_login: "MentallyQuill",
      permissions: { actions: "write", variables: "read" },
    },
  ]);
  expect([...result.logs, ...result.errors].join("\n")).not.toContain(jwt);
  expect([...result.logs, ...result.errors].join("\n")).not.toContain(
    diagnosticPrivateKey,
  );
  expect(installationDiagnostic()).not.toMatch(
    /child_process|execFile|spawn|writeFile|process\.argv|GH_TOKEN|GH_DEBUG|fetch\s*\([^"']/u,
  );
});

test("the diagnostic fails without logging raw credential-bearing transport errors", async () => {
  const result = await executeInstallationDiagnostic(async (_url, options) => {
    const headers = options.headers as Record<string, string>;
    throw new Error(`${headers.Authorization}\n${diagnosticPrivateKey}`);
  });
  expect(result.requests).toHaveLength(1);
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(result.errors).toEqual(["Installation metadata read failed."]);
});

test("the diagnostic reports only the status for a denied App JWT read", async () => {
  const result = await executeInstallationDiagnostic(async () => ({
    ok: false,
    status: 403,
    json: async () => {
      throw new Error("a denied response body must never be read or logged");
    },
  }));
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(result.errors).toEqual([
    "Installation metadata read failed (HTTP 403).",
  ]);
});

test("the diagnostic rejects malformed installation metadata without echoing response contents", async () => {
  const result = await executeInstallationDiagnostic(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 154417139,
      app_id: 123456,
      account: { login: "MentallyQuill\nuntrusted-extra-field" },
      permissions: { variables: "read" },
    }),
  }));
  expect(result.process.exitCode).toBe(1);
  expect(result.logs).toEqual([]);
  expect(result.errors).toEqual(["Installation metadata read failed."]);
});
