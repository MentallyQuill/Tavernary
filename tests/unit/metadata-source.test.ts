import { expect, test, vi } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { observeMetadataSource } from "../../scripts/automation/metadata-preparation.mjs";
import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";

test("metadata acquisition verifies immutable identity before reading a pinned README", async () => {
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
  });
  expect(result.evidence.sourceIdentity).toBe(
    `github:${fixture.source.repository_id}`,
  );
  expect(result.evidence.headSha).toBe(fixture.snapshot.repository.head_sha);
  expect(fetchImpl.mock.calls[1][0]).toContain(
    `?ref=${fixture.snapshot.repository.head_sha}`,
  );
  expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});

test("a reused repository name cannot supply metadata for another numeric identity", async () => {
  const fixture = await metadataMaintenanceFixture();
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
    }),
  ).rejects.toMatchObject({ code: "authorization-lost" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
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
    }),
  ).rejects.toMatchObject({ code: "provider-rate-limited" });
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
});

test("a README provider 503 remains transient after source loading", async () => {
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
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const failure = await observeMetadataSource({
    state: fixture.state,
    operation: fixture.operation,
    fetchImpl,
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
