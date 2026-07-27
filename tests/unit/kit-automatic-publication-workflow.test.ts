import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("valid Kit triage dispatches serialized publication automatically", async () => {
  const source = await readFile(
    ".github/workflows/triage-kit-submission.yml",
    "utf8",
  );
  const workflow = parse(source) as {
    permissions: Record<string, string>;
    jobs: {
      validate: {
        steps: Array<{
          id?: string;
          name?: string;
          if?: string;
          run?: string;
        }>;
      };
    };
  };

  expect(workflow.permissions.contents).toBe("read");
  expect(workflow.permissions.actions).toBe("write");
  const triage = workflow.jobs.validate.steps.find(
    (step) => step.name === "Validate and label Kit submission",
  );
  expect(triage?.id).toBe("triage");
  const publish = workflow.jobs.validate.steps.find(
    (step) => step.name === "Publish valid Kit",
  );
  expect(publish?.if).toContain("steps.triage.outputs.publish == 'true'");
  expect(publish?.run).toContain(
    "gh workflow run apply-kit-submission.yml",
  );
  expect(publish?.run).toContain("--ref main");
  expect(publish?.run).toContain('-f issue_number="$ISSUE_NUMBER"');
});
