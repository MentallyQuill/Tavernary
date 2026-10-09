import { expect, test, vi } from "vitest";
import { createProjectReconciliationRequest } from "../../scripts/automation/project-reconciliation-request.mjs";

test("regeneration diverts into writer allowance and binds only its current issue and workflow", async () => {
  const gh = vi.fn(async () => "");
  const prepareGeneration = vi.fn(async () => {});
  const bridge = createProjectReconciliationRequest({
    repository: "Owner/Repo",
    request: vi.fn(),
    gh,
    publish: vi.fn(),
    issueNumber: 42,
    generationWorkflow: "generate-project-submission.yml",
    prepareGeneration,
  });
  const path =
    "/repos/Owner/Repo/actions/workflows/generate-project-submission.yml/dispatches";
  await bridge(path, {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
      inputs: { issue_number: "42", force_regeneration: "false" },
    }),
  });
  expect(prepareGeneration).toHaveBeenCalledOnce();
  expect(gh).not.toHaveBeenCalled();
  for (const body of [
    { ref: "main", inputs: { issue_number: "43" } },
    { ref: "other", inputs: { issue_number: "42" } },
    { ref: "main", inputs: { issue_number: "42", force_regeneration: "true" } },
  ])
    await expect(
      bridge(path, { method: "POST", body: JSON.stringify(body) }),
    ).rejects.toThrow();
  await expect(
    bridge(path.replace("project-submission", "project-owner-request"), {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { issue_number: "42" } }),
    }),
  ).rejects.toThrow();
  expect(prepareGeneration).toHaveBeenCalledOnce();
  expect(gh).not.toHaveBeenCalled();
});

test("project projections preserve default automation-bot custody while dispatches use the App", async () => {
  const request = vi.fn(async () => null);
  const gh = vi.fn(async () => "");
  const publish = vi.fn(async () => {});
  const bridge = createProjectReconciliationRequest({
    repository: "Owner/Repo",
    request,
    gh,
    publish,
  });
  const projection = {
    method: "POST",
    body: JSON.stringify({ body: "status" }),
  };
  await bridge("/repos/Owner/Repo/issues/42/comments", projection);
  expect(request).toHaveBeenCalledWith(
    "/repos/Owner/Repo/issues/42/comments",
    projection,
  );
  expect(gh).not.toHaveBeenCalled();
  const body = JSON.stringify({ ref: "automation/project-submission-42" });
  await bridge("/repos/Owner/Repo/actions/workflows/ci.yml/dispatches", {
    method: "POST",
    body,
  });
  expect(gh).toHaveBeenCalledWith(
    [
      "api",
      "--method",
      "POST",
      "repos/Owner/Repo/actions/workflows/ci.yml/dispatches",
      "--input",
      "-",
    ],
    body,
  );
  await bridge(
    "/repos/Owner/Repo/actions/workflows/publish-project-transaction.yml/dispatches",
    {
      method: "POST",
      body: JSON.stringify({
        ref: "main",
        inputs: { validation_run_id: "701" },
      }),
    },
  );
  expect(publish).toHaveBeenCalledOnce();
  expect(gh).toHaveBeenCalledTimes(1);
});

test("publication diversion rejects a changed repository or non-main dispatch", async () => {
  const request = vi.fn(async () => null);
  const publish = vi.fn(async () => {});
  const bridge = createProjectReconciliationRequest({
    repository: "Owner/Repo",
    request,
    gh: vi.fn(),
    publish,
  });
  await expect(
    bridge(
      "/repos/Owner/Repo/actions/workflows/publish-project-transaction.yml/dispatches",
      { method: "POST", body: JSON.stringify({ ref: "feature" }) },
    ),
  ).rejects.toThrow();
  await expect(
    bridge(
      "/repos/Other/Repo/actions/workflows/publish-project-transaction.yml/dispatches",
      { method: "POST", body: JSON.stringify({ ref: "main" }) },
    ),
  ).rejects.toThrow();
  expect(publish).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
