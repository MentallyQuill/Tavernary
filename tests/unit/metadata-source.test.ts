import { expect, test, vi } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { observeMetadataSource } from "../../scripts/automation/metadata-preparation.mjs";

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
