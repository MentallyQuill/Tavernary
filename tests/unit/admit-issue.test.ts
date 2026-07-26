import { expect, test, vi } from "vitest";

import {
  issueAdmissionOutputs,
  listOpenIssues,
  processIssueAdmission,
} from "../../scripts/submissions/admit-issue.mjs";

function event(
  number = 11,
  association = "NONE",
  action: "opened" | "reopened" = "opened",
) {
  return {
    action,
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: {
      number,
      state: "open",
      created_at: `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
      author_association: association,
      user: { id: 42, login: "submitter" },
      labels: [],
    },
  };
}

function openIssues(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    created_at: `2026-07-25T00:${String(index + 1).padStart(2, "0")}:00Z`,
    user: { id: 42 },
  }));
}

test("paginates open issues and preserves numeric identity data", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    created_at: "2026-07-25T00:00:00Z",
    user: { id: 42 },
  }));
  const request = vi
    .fn()
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce([
      {
        number: 101,
        created_at: "2026-07-25T00:00:00Z",
        user: { id: 42 },
      },
    ]);

  await expect(
    listOpenIssues({
      repository: "MentallyQuill/Tavernary",
      creator: "submitter",
      request,
    }),
  ).resolves.toHaveLength(101);
  expect(request).toHaveBeenNthCalledWith(
    2,
    "/repos/MentallyQuill/Tavernary/issues?state=open&creator=submitter&per_page=100&page=2",
  );
});

test("admits an issue within the oldest ten", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("?state=open")) return openIssues(10);
    return null;
  });

  await expect(
    processIssueAdmission({ event: event(10), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "within-limit" });
  expect(request.mock.calls.map(([path]) => path)).toContain(
    "/repos/MentallyQuill/Tavernary/issues/10/labels/issue-limit-reached",
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/10/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("closes the eleventh issue with one neutral marker comment", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (path.includes("?state=open")) return openIssues(11);
      if (path.includes("/comments?") && !options?.method) return [];
      return null;
    },
  );

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: false, reason: "over-limit" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11",
    {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
    },
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path === "/repos/MentallyQuill/Tavernary/issues/11/comments" &&
        options?.method === "POST" &&
        options.body?.includes("tavernary-open-issue-limit"),
    ),
  ).toBe(true);
});

test("rechecks a reopened issue and updates its existing marker comment", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (path.includes("?state=open")) return openIssues(11);
      if (path.includes("/comments?") && !options?.method) {
        return [
          {
            id: 700,
            body: "<!-- tavernary-open-issue-limit -->\nOld copy",
          },
        ];
      }
      return null;
    },
  );

  await processIssueAdmission({
    event: event(11, "NONE", "reopened"),
    request,
  });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/comments/700",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/11/comments") && options?.method === "POST",
    ),
  ).toBe(false);
});

test("fails open when the open-issue lookup fails", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("?state=open")) throw new Error("GitHub 503");
    return null;
  });

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "lookup-failed" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("trusted collaborators bypass lookup and admission limits", async () => {
  const request = vi.fn(async (_path: string) => null);

  await expect(
    processIssueAdmission({
      event: event(50, "COLLABORATOR"),
      request,
    }),
  ).resolves.toMatchObject({ admitted: true, reason: "trusted" });
  expect(
    request.mock.calls.some(([path]) => String(path).includes("?state=open")),
  ).toBe(false);
});

test("reports admission outputs for downstream workflow dispatch", () => {
  expect(
    issueAdmissionOutputs({ admitted: true }, event(21, "COLLABORATOR")),
  ).toEqual({
    admitted: "true",
    issue_number: "21",
  });
});
