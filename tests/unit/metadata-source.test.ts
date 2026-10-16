import { expect, test, vi } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import {
  metadataOperationRecords,
  observeMetadataSource,
  observeProjectMetadataSource,
} from "../../scripts/automation/metadata-preparation.mjs";
import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";

test("repository rejection retains the entered acquisition boundary", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 422 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "source-unavailable", status: 422 });
  expect(phases).toEqual(["source-setup", "source-repository-request"]);
});

test("a swallowed README rejection retains its request boundary", async () => {
  const fixture = await metadataMaintenanceFixture();
  const [owner, name] = fixture.source.repository.split("/");
  const phases: string[] = [];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 422 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "source-unavailable", status: 422 });
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
    "source-readme-prepare",
    "source-readme-request",
  ]);
});

test("fulfilled unusable README content returns to preparation before readiness fails", async () => {
  const fixture = await metadataMaintenanceFixture();
  fixture.snapshot.repository.description = null;
  const [owner, name] = fixture.source.repository.split("/");
  const phases: string[] = [];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ path: "README.md", encoding: "base64", content: "!" }),
    );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "readme-unusable" });
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
    "source-readme-prepare",
    "source-readme-request",
    "source-readme-prepare",
  ]);
});

test("normalization failure retains the normalization acquisition boundary", async () => {
  const fixture = await metadataMaintenanceFixture();
  fixture.snapshot.repository.description = "Invalid\u0001description";
  const [owner, name] = fixture.source.repository.split("/");
  const phases: string[] = [];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toThrow("Metadata source content is invalid.");
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
    "source-readme-prepare",
    "source-readme-request",
    "source-readme-prepare",
    "source-normalize",
  ]);
});

test("pre-README readiness failure retains preparation without entering the request", async () => {
  const fixture = await metadataMaintenanceFixture();
  fixture.snapshot.stale_since = new Date(fixture.state.nowMs).toISOString();
  const [owner, name] = fixture.source.repository.split("/");
  const phases: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
    Response.json({
      id: fixture.source.repository_id,
      owner: { login: owner },
      name,
    }),
  );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "stale-source" });
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
    "source-readme-prepare",
  ]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("local source setup failure retains setup without making a request", async () => {
  const fixture = await metadataMaintenanceFixture();
  fixture.state.root = `${fixture.state.root}/package.json`;
  const phases: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>();
  const failure = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
    onAcquisitionPhase: (phase) => phases.push(phase),
  }).catch((error: unknown) => error);
  expect(failure).toMatchObject({
    code: expect.stringMatching(/^(?:ENOENT|ENOTDIR)$/u),
  });
  expect(phases).toEqual(["source-setup"]);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  { observer: "operation", failureMode: "getter" },
  { observer: "operation", failureMode: "callback" },
  { observer: "project", failureMode: "getter" },
  { observer: "project", failureMode: "callback" },
])(
  "$observer observer preserves success when its marker $failureMode throws",
  async ({ observer, failureMode }) => {
    const fixture = await metadataMaintenanceFixture();
    const [owner, name] = fixture.source.repository.split("/");
    const observe =
      observer === "operation"
        ? observeMetadataSource
        : observeProjectMetadataSource;
    const fields = {
      state: fixture.state,
      operation: fixture.operation,
      ...metadataOperationRecords({
        state: fixture.state,
        operation: fixture.operation,
      }),
    };
    const createFetch = () =>
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            id: fixture.source.repository_id,
            owner: { login: owner },
            name,
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const expected = await observe({ ...fields, fetchImpl: createFetch() });
    let getterReads = 0;
    let callbackCalls = 0;
    const callbackFailure = new Error("private callback failure");
    const actual = await observe({
      ...fields,
      fetchImpl: createFetch(),
      get onAcquisitionPhase() {
        getterReads += 1;
        if (failureMode === "getter") throw callbackFailure;
        return () => {
          callbackCalls += 1;
          throw callbackFailure;
        };
      },
    });
    expect(actual).toEqual(expected);
    expect(getterReads).toBe(7);
    expect(callbackCalls).toBe(failureMode === "callback" ? 7 : 0);
  },
);

test.each(["getter", "callback"])(
  "throwing marker %s preserves the original repository error and existing property reads",
  async (failureMode) => {
    const fixture = await metadataMaintenanceFixture();
    let nameReads = 0;
    let statusReads = 0;
    let unexpectedReads = 0;
    const original = Object.defineProperties(
      {},
      {
        name: {
          get() {
            nameReads += 1;
            return "Error";
          },
        },
        status: {
          get() {
            statusReads += 1;
            return 422;
          },
        },
        code: {
          get() {
            unexpectedReads += 1;
            throw new Error("Unexpected code access");
          },
        },
        message: {
          get() {
            unexpectedReads += 1;
            throw new Error("Unexpected message access");
          },
        },
      },
    );
    const callbackFailure = new Proxy(
      {},
      {
        get() {
          unexpectedReads += 1;
          throw new Error("Unexpected marker error access");
        },
      },
    );
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(original);
    let getterReads = 0;
    const failure = await observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      get onAcquisitionPhase() {
        getterReads += 1;
        if (failureMode === "getter") throw callbackFailure;
        return () => {
          throw callbackFailure;
        };
      },
    }).catch((error: unknown) => error);
    expect(failure).toBe(original);
    expect(getterReads).toBe(2);
    expect(nameReads).toBe(1);
    expect(statusReads).toBe(1);
    expect(unexpectedReads).toBe(0);
  },
);

test("source supersession retains its classification before observer markers", async () => {
  const fixture = await metadataMaintenanceFixture();
  fixture.state.operations = [];
  const phases: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>();
  const failure = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
    onAcquisitionPhase: (phase) => phases.push(phase),
  }).then(
    () => null,
    (error: { code?: string }) =>
      classifyAutomationFailure({ diagnosticCode: error.code }),
  );
  expect(failure).toEqual({
    kind: "superseded",
    reasonCode: "input-superseded",
  });
  expect(phases).toEqual([]);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("metadata acquisition verifies immutable identity before reading a pinned README", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        path: "README.md",
        encoding: "base64",
        content: Buffer.from(
          "# Project\nA verified source description.",
        ).toString("base64"),
      }),
    );
  const result = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
    onAcquisitionPhase: (phase) => phases.push(phase),
  });
  expect(result.evidence.sourceIdentity).toBe(
    `github:${fixture.source.repository_id}`,
  );
  expect(result.evidence.headSha).toBe(fixture.snapshot.repository.head_sha);
  expect(fetchImpl.mock.calls[1][0]).toContain(
    `?ref=${fixture.snapshot.repository.head_sha}`,
  );
  expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
    "source-readme-prepare",
    "source-readme-request",
    "source-readme-prepare",
    "source-normalize",
  ]);
});

test("a reused repository name cannot supply metadata for another numeric identity", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: fixture.source.repository_id + 1,
      owner: { login: owner },
      name,
    }),
  );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "authorization-lost" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(phases).toEqual([
    "source-setup",
    "source-repository-request",
    "source-setup",
  ]);
});

test("an oversized source response stops before README or model acquisition", async () => {
  const fixture = await metadataMaintenanceFixture();
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("{}", { headers: { "content-length": "2097153" } }),
    );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "source-invalid" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("missing README uses the verified snapshot description without inventing content", async () => {
  const fixture = await metadataMaintenanceFixture();
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  const result = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
  });
  expect(result.source.status).toBe("ready");
  if (result.source.status !== "ready")
    throw new Error("Source was unavailable");
  expect(result.source.sourceKind).toBe("description");
  expect(result.evidence.normalizedContent).toContain(
    fixture.snapshot.repository.description,
  );
});

test("a missing mandatory repository loses source authorization before README lookup", async () => {
  const fixture = await metadataMaintenanceFixture();
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 404 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "authorization-lost" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a GitHub repository rate limit remains a sanitized transient diagnostic", async () => {
  const fixture = await metadataMaintenanceFixture();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("private upstream detail", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    }),
  );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
});

test("an HTTP 429 repository response reports a rate limit", async () => {
  const fixture = await metadataMaintenanceFixture();
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 429 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
});

test("a GitHub secondary rate limit with Retry-After remains transient", async () => {
  const fixture = await metadataMaintenanceFixture();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      status: 403,
      headers: { "retry-after": "60" },
    }),
  );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
});

test("a rate-limited README remains transient after source loading", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
      onAcquisitionPhase: (phase) => phases.push(phase),
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
  expect(phases.at(-1)).toBe("source-readme-request");
});

test("a README 403 with rate-limit headers remains transient", async () => {
  const fixture = await metadataMaintenanceFixture();
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
});

test("a README 403 without rate headers remains an authentication failure", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const failure = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
    onAcquisitionPhase: (phase) => phases.push(phase),
  }).then(
    () => null,
    (error: { code?: string; status?: number }) =>
      classifyAutomationFailure({
        diagnosticCode: error.code,
        httpStatus: error.status,
      }),
  );
  expect(failure).toEqual({
    kind: "configuration",
    reasonCode: "authentication-unavailable",
  });
  expect(phases.at(-1)).toBe("source-readme-request");
});

test("a README provider 503 remains transient after source loading", async () => {
  const fixture = await metadataMaintenanceFixture();
  const phases: string[] = [];
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const failure = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
    onAcquisitionPhase: (phase) => phases.push(phase),
  }).then(
    () => null,
    (error: { code?: string; status?: number }) =>
      classifyAutomationFailure({
        diagnosticCode: error.code,
        httpStatus: error.status,
      }),
  );
  expect(failure).toEqual({
    kind: "transient",
    reasonCode: "provider-unavailable",
  });
  expect(phases.at(-1)).toBe("source-readme-request");
});

test("a README network error keeps its sanitized transient diagnostic", async () => {
  const fixture = await metadataMaintenanceFixture();
  const [owner, name] = fixture.source.repository.split("/");
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: fixture.source.repository_id,
        owner: { login: owner },
        name,
      }),
    )
    .mockRejectedValueOnce(new TypeError("private upstream detail"));
  await expect(
    observeMetadataSource({
      state: fixture.state,
      operation: fixture.operation,
      fetchImpl,
    }),
  ).rejects.toMatchObject({
    code: "provider-network-error",
    message: "Verified metadata source is unavailable.",
  });
});
