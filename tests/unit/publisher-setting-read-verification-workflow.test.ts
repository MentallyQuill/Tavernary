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
  const [token, read] = workflow.jobs.verify.steps;
  expect(workflow.jobs.verify.steps).toHaveLength(2);
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
  const read = workflow.jobs.verify.steps[1];
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
