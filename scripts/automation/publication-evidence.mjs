import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  canonicalGitBlobSha,
  validateCanonicalPublicationRecord,
} from "./publication-record.mjs";

export async function readCanonicalPublicationEvidence({
  root,
  revision,
  records,
}) {
  if (
    !/^[a-f0-9]{40}$/u.test(revision ?? "") ||
    !Array.isArray(records) ||
    records.length > 100_000
  )
    throw new Error("Publication evidence request is invalid.");
  const wanted = new Map(
    records.map((value) => {
      const record = validateCanonicalPublicationRecord(value);
      return [
        `data/maintenance/automation/publications/${record.operation.key}.json`,
        record,
      ];
    }),
  );
  if (wanted.size !== records.length)
    throw new Error("Publication evidence records are duplicated.");
  const publications = [];
  const fileDigests = {};
  if (!wanted.size) return { publications, fileDigests };
  const child = spawn(
    "git",
    [
      "log",
      "--format=%H",
      "--raw",
      "--no-abbrev",
      "--no-renames",
      "--diff-merges=first-parent",
      revision,
      "--",
      "data/maintenance/automation/publications",
      "data/maintenance/automation/metadata",
      "data/registry",
      "data/snapshots",
      "data/security",
      "data/reports/enrichment-canary.json",
      "data/reports/enrichment-report.json",
    ],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  let stopped = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 120_000);
  const complete = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  complete.catch(() => {});
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let commit;
  let files = new Map();
  function finishCommit() {
    for (const [path, entry] of files) {
      const record = wanted.get(path);
      if (!record) continue;
      if (
        entry.mode !== "100644" ||
        entry.sha !==
          canonicalGitBlobSha(`${JSON.stringify(record, null, 2)}\n`) ||
        record.files.some(
          (file) =>
            files.get(file.path)?.mode !== "100644" ||
            files.get(file.path)?.sha !== file.gitBlobSha,
        )
      )
        throw new Error(
          "Publication evidence is not co-committed with its exact regular data.",
        );
      publications.push({ record, revision: commit });
      for (const file of record.files)
        fileDigests[`${commit}:${file.path}`] = file.sha256;
      wanted.delete(path);
    }
    return wanted.size === 0;
  }
  try {
    for await (const line of lines) {
      if (/^[a-f0-9]{40}$/u.test(line)) {
        if (commit && finishCommit()) {
          stopped = true;
          child.kill();
          break;
        }
        commit = line;
        files = new Map();
        continue;
      }
      const entry =
        /^:\d{6} (\d{6}) [a-f0-9]{40} ([a-f0-9]{40}) [A-Z]\d*\t(.+)$/u.exec(
          line,
        );
      if (entry && commit) {
        if (files.size >= 100_000)
          throw new Error(
            "Canonical commit exceeds its bounded evidence inventory.",
          );
        files.set(entry[3], { mode: entry[1], sha: entry[2] });
      }
    }
    if (!stopped && commit) finishCommit();
    const code = await complete;
    if (timedOut || (!stopped && code !== 0) || wanted.size)
      throw new Error(
        "Publication evidence has no canonical co-committed proof.",
      );
    return { publications, fileDigests };
  } finally {
    clearTimeout(timer);
    lines.close();
    if (!child.killed) child.kill();
    await complete.catch(() => {});
  }
}
