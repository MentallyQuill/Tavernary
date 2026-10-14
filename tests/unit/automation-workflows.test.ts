import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { readProjectPublicationEnabled } from "../../scripts/automation/publication-setting.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import { parse } from "yaml";
import { runInNewContext } from "node:vm";

test.each([
  ["deploy-pages.yml", "Site: Deploy e4e5436c", "push"],
  ["deploy-pages.yml", "Site: Deploy e4e5436c", "workflow_dispatch"],
  ["restore-site.yml", "Site: Restore release407557671", "workflow_dispatch"],
  [
    "request-catalog-enrichment.yml",
    "Owner metadata rollout",
    "workflow_dispatch",
  ],
  [
    "generate-project-submission.yml",
    "Project #42: Request review PR force=true",
    "workflow_dispatch",
  ],
  [
    "generate-project-owner-request.yml",
    "Owner request #42: Request review PR force=true",
    "workflow_dispatch",
  ],
])(
  "completed %s wakes retain owner authorization with a dynamic run title",
  (file, name, event) => {
    const workflow = parse(
      readFileSync(".github/workflows/automation-prepared.yml", "utf8"),
    );
    const context = {
      github: {
        repository: "MentallyQuill/Tavernary",
        event: {
          workflow_run: {
            path: `.github/workflows/${file}`,
            name,
            event,
            head_branch: "main",
            head_repository: { full_name: "MentallyQuill/Tavernary" },
            actor: { id: 2625904 },
          },
        },
      },
      vars: { TAVERNARY_PUBLISHER_BOT_ID: 317929880 },
    };
    expect(
      runInNewContext(workflow.jobs.wake.if, context, { timeout: 1000 }),
    ).toBe(true);
    const run = context.github.event.workflow_run;
    for (const denied of [
      { ...run, head_branch: "other" },
      { ...run, head_repository: { full_name: "Foreign/Repo" } },
      { ...run, event: "workflow_dispatch", actor: { id: 999 } },
      { ...run, path: ".github/workflows/foreign.yml" },
    ]) {
      expect(
        runInNewContext(
          workflow.jobs.wake.if,
          {
            ...context,
            github: { ...context.github, event: { workflow_run: denied } },
          },
          { timeout: 1000 },
        ),
      ).toBe(false);
    }
  },
);

test("expired-archive retention has the browsers required by its public-proof fallback", () => {
  const workflow = parse(
    readFileSync(".github/workflows/automation-writer.yml", "utf8"),
  );
  const browsers = workflow.jobs.write.steps.find(
    (step: { name?: string }) =>
      step.name === "Install public verification browsers",
  );
  expect(browsers.run).toContain(
    "playwright install --with-deps chromium webkit",
  );
  expect(browsers.if).toContain("inputs.mode == 'retain'");
});

test("owner rollouts use read-only native requests and enrichment has no privileged legacy writer", () => {
  const enrichment = parse(
    readFileSync(".github/workflows/enrich-catalog.yml", "utf8"),
  );
  const request = parse(
    readFileSync(".github/workflows/request-catalog-enrichment.yml", "utf8"),
  );
  expect(Object.keys(enrichment.jobs)).toEqual(["prepare"]);
  expect(enrichment.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  expect(
    enrichment.on.workflow_dispatch.inputs.enrichment_scope,
  ).toBeUndefined();
  expect(enrichment.on.workflow_dispatch.inputs.operation_key.required).toBe(
    true,
  );
  expect(request.jobs.request["timeout-minutes"]).toBe(5);
  expect(request.permissions).toEqual({ contents: "read" });
  expect(request.jobs.request.if).toContain("github.actor_id == 2625904");
  expect(JSON.stringify(request)).not.toMatch(
    /PRIVATE_KEY|UTILITY_API_KEY|permission-contents/,
  );
});

test.each(["enrich-catalog.yml", "review-catalog-policy.yml"])(
  "reconciled %s provides a pinned read-only budgeted preparation endpoint",
  (workflowName) => {
    const workflow = parse(
      readFileSync(`.github/workflows/${workflowName}`, "utf8"),
    );
    expect(workflow.on.workflow_dispatch.inputs.operation_key).toBeDefined();
    expect(workflow.on.workflow_dispatch.inputs.budget_ticket).toBeDefined();
    const job = workflow.jobs.prepare;
    expect(job["timeout-minutes"]).toBe(45);
    expect(job.permissions).toEqual({
      contents: "read",
      actions: "read",
      issues: "read",
      "pull-requests": "read",
    });
    expect(job.if).toContain(
      "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
    );
    const checkout = job.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout.with.ref).toBe("${{ github.sha }}");
    expect(checkout.with["persist-credentials"]).toBe(false);
    const prepare = job.steps.find(
      (step: { run?: string }) =>
        step.run === "node scripts/automation/catalog-preparation-cli.mjs",
    );
    expect(prepare.env.TAVERNARY_REQUIRE_MODEL_BUDGET).toBe("true");
    expect(
      job.steps.some(
        (step: { with?: Record<string, unknown> }) =>
          step.with?.["permission-contents"] === "write",
      ),
    ).toBe(false);
    for (const [name, legacy] of Object.entries(workflow.jobs) as Array<
      [string, { if?: string }]
    >) {
      if (name !== "prepare" && legacy.if && !legacy.if.includes("needs."))
        expect(legacy.if).toContain("inputs.operation_key == ''");
    }
  },
);

test("the controller runs every fifteen minutes using trusted main code and bounded execution", () => {
  const workflow = readFileSync(
    ".github/workflows/reconcile-automation.yml",
    "utf8",
  );
  expect(workflow).toContain('cron: "3,18,33,48 * * * *"');
  expect(workflow).toContain("ref: main");
  expect(workflow).toContain("timeout-minutes: 15");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("node scripts/automation/controller-wake.mjs");
  expect(workflow).not.toContain("permission-contents: write");
});

test("project validation completions wake the coalesced canonical controller with scoped dispatch authority", () => {
  const workflow = parse(
    readFileSync(".github/workflows/reconcile-project-validations.yml", "utf8"),
  );
  expect(workflow.concurrency).toEqual({
    group: "automation-controller",
    "cancel-in-progress": false,
  });
  expect(workflow.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  const job = workflow.jobs.reconcile;
  expect(job["timeout-minutes"]).toBe(15);
  expect(job.environment).toBe("publisher");
  const token = job.steps.find(
    (step: { id?: string }) => step.id === "controller-token",
  );
  expect(token.with).toEqual({
    "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
    "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
    "permission-actions": "write",
  });
  const wake = job.steps.find(
    (step: { run?: string }) =>
      step.run === "node scripts/automation/controller-wake.mjs",
  );
  expect(wake.env.GH_TOKEN).toBe("${{ steps.controller-token.outputs.token }}");
  expect(
    job.steps.some((step: { run?: string }) =>
      step.run?.includes("submissions:reconcile-validations"),
    ),
  ).toBe(false);
  const watcher = job.steps.find((step: { run?: string }) =>
    step.run?.startsWith("gh run watch"),
  );
  expect(watcher.if).toBe(
    "github.event_name == 'workflow_dispatch' && inputs.validation_run_id != ''",
  );
  expect(watcher.env.VALIDATION_RUN_ID).toBe("${{ inputs.validation_run_id }}");
});

test("operation preparation is bound to a key and limited to forty-five minutes", () => {
  const workflow = readFileSync(
    ".github/workflows/automation-worker.yml",
    "utf8",
  );
  expect(workflow).toContain(
    'run-name: "Automation ${{ inputs.operation_key }}"',
  );
  expect(workflow).toContain("timeout-minutes: 45");
  expect(workflow).toContain("ref: main");
  expect(workflow).toContain("permission-actions: write");
  expect(workflow).not.toContain("permission-contents: write");
  expect(workflow).toContain("vars.TAVERNARY_PUBLISHER_BOT_ID");
});

test("every successful workflow wake names an actual workflow and failures rely on scheduled recovery", () => {
  const controller = readFileSync(
    ".github/workflows/reconcile-automation.yml",
    "utf8",
  );
  const actualNames = new Set(
    readdirSync(".github/workflows")
      .filter((file) => file.endsWith(".yml"))
      .map(
        (file) =>
          readFileSync(`.github/workflows/${file}`, "utf8").match(
            /^name: "([^"]+)"/mu,
          )?.[1],
      ),
  );
  const watched = controller.match(/    workflows:\n([\s\S]*?)    types:/u)![1];
  for (const [, name] of watched.matchAll(/- "([^"]+)"/gu))
    expect(actualNames.has(name)).toBe(true);
  expect(controller).toContain(
    "github.event.workflow_run.conclusion == 'success'",
  );
});

test("the canonical writer queues receipt mutations and mints its write token after setup", () => {
  const writer = readFileSync(
    ".github/workflows/automation-writer.yml",
    "utf8",
  );
  expect(writer).toContain("group: canonical-publication");
  expect(writer).toContain("queue: max");
  expect(writer).toContain("cancel-in-progress: false");
  expect(writer).toContain("ref: main");
  expect(writer).toContain("permission-contents: write");
  expect(writer).toContain("permission-checks: read");
  expect(writer).toContain(
    "permission-workflows: ${{ inputs.mode == 'retain' && 'write' || '' }}",
  );
  expect(writer.indexOf("Create fresh scoped writer token")).toBeGreaterThan(
    writer.indexOf("npm ci"),
  );
  expect(writer).toContain("node scripts/automation/writer-cli.mjs");
});

test("publication settings use a separate optional read-only App token without widening writer custody", () => {
  const workflow = parse(
    readFileSync(".github/workflows/automation-writer.yml", "utf8"),
  );
  const steps = workflow.jobs.write.steps as Array<{
    id?: string;
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
    env?: Record<string, unknown>;
    "continue-on-error"?: boolean;
  }>;
  const writer = steps.find((step) => step.id === "writer-token")!;
  const reader = steps.find(
    (step) => step.id === "publication-settings-token",
  )!;
  expect(reader).toMatchObject({
    "continue-on-error": true,
    uses: writer.uses,
    with: {
      "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
      "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
      "permission-actions-variables": "read",
    },
  });
  expect(
    Object.keys(reader.with!).filter((key) => key.startsWith("permission-")),
  ).toEqual(["permission-actions-variables"]);
  expect(writer.with).not.toHaveProperty("permission-actions-variables");
  const apply = steps.find(
    (step) => step.name === "Apply current canonical operation",
  )!;
  expect(apply.env).toMatchObject({
    GH_TOKEN: "${{ steps.writer-token.outputs.token }}",
    TAVERNARY_PUBLICATION_SETTINGS_TOKEN:
      "${{ steps.publication-settings-token.outputs.token || secrets.TAVERNARY_PUBLICATION_SETTINGS_PAT }}",
  });
  expect(steps.indexOf(reader)).toBeLessThan(steps.indexOf(apply));
  expect(workflow.env).toBeUndefined();
  expect(workflow.jobs.write.env).toBeUndefined();
  for (const step of steps)
    expect(
      JSON.stringify(step).includes("TAVERNARY_PUBLICATION_SETTINGS_PAT"),
    ).toBe(step === apply);
  expect(
    Object.keys(apply.env!).filter((name) =>
      name.includes("PUBLICATION_SETTINGS"),
    ),
  ).toEqual(["TAVERNARY_PUBLICATION_SETTINGS_TOKEN"]);
});

test.each([
  [
    "App reader wins when both are available",
    "app-reader-credential",
    "pat-reader-credential",
    "app-reader-credential",
  ],
  [
    "PAT reader is used after App mint failure",
    "",
    "pat-reader-credential",
    "pat-reader-credential",
  ],
  [
    "PAT reader is used when App output is missing",
    undefined,
    "pat-reader-credential",
    "pat-reader-credential",
  ],
  ["neither reader remains unavailable", "", "", ""],
] as const)(
  "publication settings credential selection: %s",
  async (_name, appToken, pat, expected) => {
    const workflow = parse(
      readFileSync(".github/workflows/automation-writer.yml", "utf8"),
    );
    const apply = workflow.jobs.write.steps.find(
      (step: { name?: string }) =>
        step.name === "Apply current canonical operation",
    );
    const expression = apply.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN;
    const selected = runInNewContext(
      expression
        .slice(3, -2)
        .replace(
          "steps.publication-settings-token",
          'steps["publication-settings-token"]',
        ),
      {
        steps: {
          "publication-settings-token": { outputs: { token: appToken } },
        },
        secrets: { TAVERNARY_PUBLICATION_SETTINGS_PAT: pat },
      },
      { timeout: 1000 },
    );
    expect(selected).toBe(expected);
    const requests: string[][] = [];
    const enabled = readProjectPublicationEnabled({
      repository: "MentallyQuill/Tavernary",
      env: {
        TAVERNARY_PUBLICATION_SETTINGS_TOKEN: selected,
        GH_TOKEN: "canonical-writer-credential",
        GITHUB_TOKEN: "workflow-credential",
        PROJECT_AUTO_PUBLICATION_ENABLED: "true",
      },
      gh: async (args, input, credential) => {
        requests.push(args);
        expect(input).toBeUndefined();
        expect(credential).toEqual({ token: expected });
        return JSON.stringify({ value: "true" });
      },
    });
    if (expected) {
      await expect(enabled).resolves.toBe(true);
      expect(requests).toEqual([
        [
          "api",
          "repos/MentallyQuill/Tavernary/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED",
        ],
      ]);
    } else {
      await expect(enabled).rejects.toMatchObject({
        code: "publisher-authentication-failed",
      });
      expect(requests).toEqual([]);
    }
  },
);

test("reconciled refreshes prepare one pinned data artifact and cannot use the legacy direct publisher", () => {
  const workflow = readFileSync(
    ".github/workflows/refresh-catalog.yml",
    "utf8",
  );
  expect(workflow).toContain("operation_key:");
  expect(workflow).toContain("inputs.operation_key == ''");
  const preparation = workflow.slice(workflow.indexOf("  prepare:"));
  expect(preparation).toContain("timeout-minutes: 45");
  expect(preparation).toContain("ref: ${{ github.sha }}");
  expect(preparation).toContain(
    "node scripts/automation/catalog-preparation-cli.mjs",
  );
  expect(preparation).toContain(
    "automation-prepared-${{ inputs.operation_key }}",
  );
  expect(preparation).toContain("retention-days: 90");
  expect(preparation).not.toContain("permission-contents: write");
  expect(preparation).not.toContain("git push");
  expect(preparation).not.toContain("gh workflow run");
  expect(preparation).toContain("/result.json");
});

test("reconciled report imports prepare pinned data with read-only credentials and preserve deterministic fallback without a ticket", () => {
  const operation = discoverReportOperations(reportInventoryFixture())[0];
  expect(planAutomationWorker(operation)).toEqual({
    action: "dispatch",
    workflow: "import-tavernkeeper-reports.yml",
    inputs: { operation_key: operation.key },
  });
  const workflow = readFileSync(
    ".github/workflows/import-tavernkeeper-reports.yml",
    "utf8",
  );
  expect(workflow).toContain("inputs.operation_key == ''");
  const prepared = workflow.slice(workflow.indexOf("  prepare:"));
  expect(prepared).toContain("ref: ${{ github.sha }}");
  expect(prepared).toContain("timeout-minutes: 45");
  expect(prepared).toContain("catalog-preparation-cli.mjs");
  expect(prepared).not.toContain("permission-contents: write");
  expect(prepared).not.toContain("git push");
  expect(prepared).toContain(
    "inputs.budget_ticket != '' && secrets.UTILITY_API_KEY || ''",
  );
  expect(prepared).toContain('TAVERNARY_REQUIRE_MODEL_BUDGET: "true"');
});
