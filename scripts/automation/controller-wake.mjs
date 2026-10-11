import { pathToFileURL } from "node:url";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

export async function wakeAutomationWriter({ gh = executeGh, repository }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ""))
    throw new Error("Controller repository is invalid.");
  // The controller's single pending slot coalesces wakes; the writer retains its
  // FIFO for distinct mutations. Keep at most one future reconcile in that FIFO.
  for (const status of ["queued", "waiting", "requested", "pending"]) {
    const page = JSON.parse(
      await gh([
        "api",
        "--method",
        "GET",
        `repos/${repository}/actions/workflows/automation-writer.yml/runs`,
        "-f",
        "branch=main",
        "-f",
        "event=workflow_dispatch",
        "-f",
        `status=${status}`,
        "-f",
        "per_page=100",
        "-f",
        "page=1",
      ]),
    );
    if (
      !Number.isSafeInteger(page.total_count) ||
      page.total_count < 0 ||
      page.total_count > 100 ||
      !Array.isArray(page.workflow_runs) ||
      page.workflow_runs.length !== page.total_count
    )
      throw new Error("Pending writer inventory is incomplete.");
    if (
      page.workflow_runs.some((run) =>
        ["Automation reconcile", "Automation write reconcile"].includes(
          String(run.display_title ?? "").trim(),
        ),
      )
    )
      return { status: "coalesced" };
  }
  await gh([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    "mode=reconcile",
  ]);
  return { status: "dispatched" };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    JSON.stringify(
      await wakeAutomationWriter({ repository: process.env.GITHUB_REPOSITORY }),
    ),
  );
