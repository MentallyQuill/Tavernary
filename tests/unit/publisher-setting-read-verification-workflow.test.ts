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

function probeScript() {
  const { source, workflow } = fixture();
  expect(workflow.jobs.verify.steps).toHaveLength(1);
  const probe = workflow.jobs.verify.steps[0];
  expect(probe.name).toBe(
    "Inspect Publisher grants and verify explicit Variables read scopes",
  );
  expect(probe.env).toEqual({
    PUBLISHER_CLIENT_ID: "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
    PUBLISHER_PRIVATE_KEY: "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
  });
  expect(probe["continue-on-error"]).toBeUndefined();
  expect(source).not.toMatch(
    /actions\/checkout|create-github-app-token|npm |writer-cli|workflow run|UTILITY_|TAVERNARY_ENRICHMENT_|git (?:push|commit)|child_process|execFile|spawn|writeFile|process\.argv|GH_TOKEN|GH_DEBUG/u,
  );
  const match = probe.run.trim().match(/^node <<'NODE'\n([\s\S]*)\nNODE$/u);
  expect(match).not.toBeNull();
  return match![1];
}

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = key.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const base = "https://api.github.com";
const mintPath = "/app/installations/154417139/access_tokens";
const settingPath =
  "/repos/MentallyQuill/Tavernary/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED";
const repository = { id: 1309605115, full_name: "MentallyQuill/Tavernary" };
const pairs = [
  ["2022-11-28", "actions_variables"],
  ["2022-11-28", "variables"],
  ["2026-03-10", "actions_variables"],
  ["2026-03-10", "variables"],
] as const;
type ProbeResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};
type ProbeRequest = { url: string; options: RequestInit };

function response(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): ProbeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}
function scopeDenial() {
  return response(422, {
    message: "The permissions requested are not granted to this installation.",
  });
}
function mintBody(options: RequestInit) {
  return JSON.parse(options.body as string) as {
    repository_ids: number[];
    permissions: Record<string, string>;
  };
}

async function executeProbe(
  respond: (path: string, options: RequestInit) => Promise<ProbeResponse>,
) {
  const logs: string[] = [];
  const errors: string[] = [];
  const requests: ProbeRequest[] = [];
  const process = {
    env: {
      PUBLISHER_CLIENT_ID: "Iv1.test_client",
      PUBLISHER_PRIVATE_KEY: privateKey,
    },
    exitCode: 0,
  };
  const timeoutSignals: object[] = [];
  const timeoutDurations: number[] = [];
  await runInNewContext(
    probeScript(),
    {
      Buffer,
      process,
      require: (module: string) => {
        expect(module).toBe("node:crypto");
        return { sign };
      },
      AbortSignal: {
        timeout: (duration: number) => {
          const signal = {};
          timeoutSignals.push(signal);
          timeoutDurations.push(duration);
          return signal;
        },
      },
      console: {
        log: (message: string) => logs.push(message),
        error: (message: string) => errors.push(message),
      },
      fetch: async (url: string, options: RequestInit) => {
        requests.push({ url, options });
        expect(url.startsWith(base)).toBe(true);
        const path = url.slice(base.length);
        if (path === "/app")
          return response(200, {
            id: 4624827,
            slug: "tavernary-publisher",
            permissions: {
              actions: "write",
              variables: "read",
              ignored: "secret-marker",
              "Future-Variables": "secret-marker",
            },
            secret: "secret-marker",
          });
        if (path === "/repos/MentallyQuill/Tavernary/installation")
          return response(200, {
            id: 154417139,
            app_id: 4624827,
            account: { login: "MentallyQuill", secret: "secret-marker" },
            permissions: { actions: "write", variables: "read" },
            secret: "secret-marker",
          });
        return respond(path, options);
      },
    },
    { timeout: 1000 },
  );
  return { logs, errors, requests, process, timeoutSignals, timeoutDurations };
}

function successfulScopeRouter(
  overrides: Partial<Record<string, ProbeResponse>> = {},
) {
  return async (path: string, options: RequestInit): Promise<ProbeResponse> => {
    if (overrides[path]) return overrides[path];
    if (path === mintPath) {
      const candidate = Object.keys(mintBody(options).permissions)[0];
      return response(201, {
        token: `ghs_test_${candidate}`,
        permissions: { [candidate]: "read", metadata: "read" },
      });
    }
    if (path === "/installation/repositories")
      return response(200, { total_count: 1, repositories: [repository] });
    if (path === settingPath) return response(200, { value: "true" });
    if (path === "/installation/token") return response(204);
    throw new Error(`Unexpected route ${path}`);
  };
}

function safeOutput(result: Awaited<ReturnType<typeof executeProbe>>) {
  const output = [...result.logs, ...result.errors].join("\n");
  for (const secret of [privateKey, "ghs_test_", "secret-marker"])
    expect(output).not.toContain(secret);
  for (const { options } of result.requests) {
    const authorization = (options.headers as Record<string, string>)
      .Authorization;
    expect(output).not.toContain(authorization);
    expect(output).not.toContain(authorization.slice(7));
    expect(options.redirect).toBe("error");
  }
  return result.logs.map((line) => JSON.parse(line));
}

test("the diagnostic tries exactly four explicit one-repository read scope/version pairs and fails closed when rejected", async () => {
  const before = Math.floor(Date.now() / 1000);
  const result = await executeProbe(async (path) => {
    expect(path).toBe(mintPath);
    return scopeDenial();
  });
  expect(result.process.exitCode).toBe(1);
  expect(result.requests).toHaveLength(6);
  const mints = result.requests.slice(2);
  expect(
    mints.map(({ options }) => [
      (options.headers as Record<string, string>)["X-GitHub-Api-Version"],
      Object.keys(mintBody(options).permissions)[0],
    ]),
  ).toEqual(pairs);
  for (const { options } of mints) {
    const candidate = Object.keys(mintBody(options).permissions)[0];
    expect(options.method).toBe("POST");
    expect(mintBody(options)).toEqual({
      repository_ids: [1309605115],
      permissions: { [candidate]: "read" },
    });
  }
  for (const [index, { options }] of result.requests.entries()) {
    expect(options.redirect).toBe("error");
    expect(options.signal).toBe(result.timeoutSignals[index]);
    expect(result.timeoutDurations[index]).toBe(15000);
    const headers = options.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["User-Agent"]).toBe(
      "Tavernary-Publisher-Installation-Probe",
    );
    expect(headers.Authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/u);
    const [header, payload, signature] =
      headers.Authorization.slice(7).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("Iv1.test_client");
    expect(claims.iat).toBeGreaterThanOrEqual(before - 60);
    expect(claims.exp - claims.iat).toBe(360);
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        key.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  }
  const output = safeOutput(result);
  expect(output.slice(0, 2)).toEqual([
    {
      event: "app-registration",
      app_id: 4624827,
      app_slug: "tavernary-publisher",
      permission_names: ["Future-Variables", "actions", "ignored", "variables"],
      permissions: { actions: "write", variables: "read" },
    },
    {
      event: "installation-grants",
      installation_id: 154417139,
      app_id: 4624827,
      account_login: "MentallyQuill",
      permission_names: ["actions", "variables"],
      permissions: { actions: "write", variables: "read" },
    },
  ]);
  expect(output.slice(2)).toEqual(
    pairs.map(([api_version, candidate]) => ({
      event: "scope-request-rejected",
      api_version,
      candidate,
      status: 422,
    })),
  );
  expect(result.errors.map((line) => JSON.parse(line))).toEqual([
    {
      event: "probe-failed",
      stage: "complete",
      reason: "no-verified-read-scope",
    },
  ]);
});

test("the first verified read revokes its narrowed token and stops before another candidate can fail", async () => {
  const router = successfulScopeRouter();
  let mints = 0;
  const result = await executeProbe(async (path, options) => {
    if (path === mintPath && ++mints > 1)
      return response(500, { message: "secret-marker" });
    return router(path, options);
  });
  expect(result.process.exitCode).toBe(0);
  expect(result.errors).toEqual([]);
  expect(mints).toBe(1);
  expect(result.requests).toHaveLength(6);
  const [apiVersion, candidate] = pairs[0];
  const requests = result.requests.slice(2);
  expect(
    requests.map(({ url, options }) => [
      url.slice(base.length),
      options.method,
    ]),
  ).toEqual([
    [mintPath, "POST"],
    ["/installation/repositories", "GET"],
    [settingPath, "GET"],
    ["/installation/token", "DELETE"],
  ]);
  for (const { options } of requests.slice(1)) {
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ghs_test_${candidate}`);
    expect(headers["X-GitHub-Api-Version"]).toBe(apiVersion);
  }
  expect(safeOutput(result).slice(2)).toEqual([
    {
      event: "scope-verified",
      api_version: apiVersion,
      candidate,
      status: 200,
      enabled: true,
    },
  ]);
});

test("a rejected wire name advances to a narrowed successful candidate with explicit or omitted optional repository metadata", async () => {
  const router = successfulScopeRouter();
  const result = await executeProbe(async (path, options) => {
    if (path === mintPath) {
      const candidate = Object.keys(mintBody(options).permissions)[0];
      if (candidate === "actions_variables") return scopeDenial();
      return response(201, {
        token: "ghs_test_variables",
        permissions: { variables: "read" },
        repository_selection: "selected",
        repositories: [repository],
      });
    }
    return router(path, options);
  });
  expect(result.process.exitCode).toBe(0);
  expect(result.requests).toHaveLength(7);
  expect(result.requests.at(-1)?.url).toBe(`${base}/installation/token`);
  expect(
    safeOutput(result)
      .slice(2)
      .map((outcome) => outcome.event),
  ).toEqual(["scope-request-rejected", "scope-verified"]);
});

test.each([
  ["missing permissions", {}],
  [
    "extra write scope",
    { permissions: { actions_variables: "read", contents: "write" } },
  ],
  ["ignored requested scope", { permissions: { metadata: "read" } }],
  ["write requested scope", { permissions: { actions_variables: "write" } }],
  [
    "broad repository selection",
    { permissions: { actions_variables: "read" }, repository_selection: "all" },
  ],
  [
    "foreign response repository",
    {
      permissions: { actions_variables: "read" },
      repositories: [{ id: 999, full_name: "other/repository" }],
    },
  ],
] as const)(
  "a minted token with %s is revoked without a switch read or another mint",
  async (_name, unsafe) => {
    const result = await executeProbe(
      successfulScopeRouter({
        [mintPath]: response(201, { token: "ghs_test_unsafe", ...unsafe }),
      }),
    );
    expect(result.process.exitCode).toBe(1);
    expect(
      result.requests.slice(2).map(({ url }) => url.slice(base.length)),
    ).toEqual([mintPath, "/installation/token"]);
    safeOutput(result);
  },
);

test.each([
  {
    total_count: 2,
    repositories: [repository, { id: 999, full_name: "other/repository" }],
  },
  {
    total_count: 1,
    repositories: [{ id: 999, full_name: "other/repository" }],
  },
  {
    total_count: 1,
    repositories: [{ id: 1309605115, full_name: "other/repository" }],
  },
])(
  "ambiguous or foreign accessible repositories stop and revoke before the switch read",
  async (listing) => {
    const result = await executeProbe(
      successfulScopeRouter({
        "/installation/repositories": response(200, listing),
      }),
    );
    expect(result.process.exitCode).toBe(1);
    expect(
      result.requests.slice(2).map(({ url }) => url.slice(base.length)),
    ).toEqual([mintPath, "/installation/repositories", "/installation/token"]);
    safeOutput(result);
  },
);

test("a false publication switch fails terminally after revocation", async () => {
  const result = await executeProbe(
    successfulScopeRouter({ [settingPath]: response(200, { value: "false" }) }),
  );
  expect(result.process.exitCode).toBe(1);
  expect(
    result.requests.filter(({ url }) => url.endsWith(mintPath)),
  ).toHaveLength(1);
  expect(result.requests.at(-1)?.url).toBe(`${base}/installation/token`);
  expect(JSON.parse(result.errors[0]).reason).toBe("publication-disabled");
  expect(JSON.parse(result.errors[0]).enabled).toBe(false);
  safeOutput(result);
});

test("ordinary switch 403 advances only after revocation and remains unsuccessful", async () => {
  const result = await executeProbe(
    successfulScopeRouter({
      [settingPath]: response(403, {
        message: "Resource not accessible by integration",
      }),
    }),
  );
  expect(result.process.exitCode).toBe(1);
  expect(result.requests).toHaveLength(18);
  expect(safeOutput(result).slice(2)).toEqual(
    pairs.map(([api_version, candidate]) => ({
      event: "endpoint-denied",
      api_version,
      candidate,
      status: 403,
    })),
  );
});

test.each([
  response(200, { value: "unknown" }),
  response(403, {}),
  response(403, null),
])(
  "malformed switch responses stop safely after revocation",
  async (settingResponse) => {
    const result = await executeProbe(
      successfulScopeRouter({ [settingPath]: settingResponse }),
    );
    expect(result.process.exitCode).toBe(1);
    expect(
      result.requests.filter(({ url }) => url.endsWith(mintPath)),
    ).toHaveLength(1);
    expect(result.requests.at(-1)?.url).toBe(`${base}/installation/token`);
    safeOutput(result);
  },
);

test.each([
  [401, {}, {}],
  [429, {}, {}],
  [500, {}, {}],
  [403, { message: "API rate limit exceeded" }, {}],
  [403, { message: "You have exceeded a secondary rate limit" }, {}],
  [403, {}, { "x-ratelimit-remaining": "0" }],
  [403, {}, { "retry-after": "10" }],
] as const)(
  "switch HTTP %s authentication/rate/server failures stop after revocation",
  async (status, body, headers) => {
    const result = await executeProbe(
      successfulScopeRouter({ [settingPath]: response(status, body, headers) }),
    );
    expect(result.process.exitCode).toBe(1);
    expect(
      result.requests.filter(({ url }) => url.endsWith(mintPath)),
    ).toHaveLength(1);
    expect(result.requests.at(-1)?.url).toBe(`${base}/installation/token`);
    expect(JSON.parse(result.errors[0]).status).toBe(status);
    safeOutput(result);
  },
);

test.each([401, 403, 429, 500, 422])(
  "unrecognized mint HTTP %s stops without echoing the raw response",
  async (status) => {
    const result = await executeProbe(async () =>
      response(status, { message: "secret-marker" }),
    );
    expect(result.process.exitCode).toBe(1);
    expect(result.requests).toHaveLength(3);
    expect(JSON.parse(result.errors[0]).status).toBe(status);
    safeOutput(result);
  },
);

test("revocation failure stops further candidates even after a successful setting read", async () => {
  const result = await executeProbe(
    successfulScopeRouter({
      "/installation/token": response(500, { message: "secret-marker" }),
    }),
  );
  expect(result.process.exitCode).toBe(1);
  expect(result.requests).toHaveLength(6);
  expect(safeOutput(result)).toHaveLength(2);
  expect(JSON.parse(result.errors[0]).stage).toBe("revoke-token");
});

test("raw credential-bearing transport errors are never logged", async () => {
  const result = await executeProbe(async (_path, options) => {
    throw new Error(
      `${(options.headers as Record<string, string>).Authorization}\n${privateKey}`,
    );
  });
  expect(result.process.exitCode).toBe(1);
  expect(result.requests).toHaveLength(3);
  expect(JSON.parse(result.errors[0]).stage).toBe("mint-token");
  safeOutput(result);
});
