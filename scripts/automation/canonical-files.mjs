import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";

const pathPattern =
  /^(?:data\/[A-Za-z0-9_./-]+|public\/catalog\/[A-Za-z0-9_.-]+)\.json$/u;
function assertInput({ revision, paths }) {
  if (
    !/^[a-f0-9]{40}$/u.test(revision ?? "") ||
    !Array.isArray(paths) ||
    paths.length > 100_000 ||
    paths.some(
      (path) =>
        !pathPattern.test(path) ||
        path.split("/").some((part) => part === ".." || part === "."),
    )
  )
    throw new Error("Canonical file request is invalid.");
}
export function readCanonicalFiles({ root, revision, paths }) {
  assertInput({ revision, paths });
  if (!paths.length) return {};
  const wanted = new Set(paths);
  const objects = new Map();
  const tree = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", revision, "--", "data", "public/catalog"],
    { cwd: root, maxBuffer: 33_554_432, timeout: 120_000, windowsHide: true },
  );
  for (const entry of tree.toString("utf8").split("\0")) {
    const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match || !wanted.has(match[4])) continue;
    if (match[1] !== "100644" || match[2] !== "blob")
      throw new Error("Canonical data is not a regular non-executable file.");
    objects.set(match[4], match[3]);
  }
  const entries = [...objects];
  const result = {};
  for (let start = 0; start < entries.length; start += 8) {
    const batch = entries.slice(start, start + 8);
    const raw = execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: batch.map(([, sha]) => `${sha}\n`).join(""),
      maxBuffer: 67_117_056,
      timeout: 120_000,
      windowsHide: true,
    });
    let offset = 0;
    for (const [path, sha] of batch) {
      const end = raw.indexOf(10, offset);
      const header = raw.subarray(offset, end).toString("ascii");
      const match = /^([a-f0-9]{40}) blob (\d+)$/u.exec(header);
      const bytes = Number(match?.[2]);
      if (
        end < offset ||
        match?.[1] !== sha ||
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        bytes > 8_388_608 ||
        end + bytes + 1 >= raw.length ||
        raw[end + bytes + 1] !== 10
      )
        throw new Error("Canonical blob data is invalid or oversized.");
      result[path] = raw.subarray(end + 1, end + bytes + 1);
      offset = end + bytes + 2;
    }
    if (offset !== raw.length)
      throw new Error("Canonical blob framing is invalid.");
  }
  return result;
}
export function canonicalFileDigests(input) {
  return Object.fromEntries(
    Object.entries(readCanonicalFiles(input)).map(([path, content]) => [
      path,
      createHash("sha256").update(content).digest("hex"),
    ]),
  );
}
export async function publicationHistory({ root, revision, paths }) {
  assertInput({ revision, paths });
  if (
    paths.some(
      (path) =>
        !/^data\/maintenance\/automation\/publications\/[a-f0-9]{64}\.json$/u.test(
          path,
        ),
    )
  )
    throw new Error("Publication history path is invalid.");
  const remaining = new Set(paths);
  if (!remaining.size) return {};
  const child = spawn(
    "git",
    [
      "log",
      "--format=%H",
      "--name-only",
      revision,
      "--",
      "data/maintenance/automation/publications",
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
  const result = {};
  let commit;
  try {
    for await (const line of lines) {
      if (/^[a-f0-9]{40}$/u.test(line)) {
        commit = line;
        continue;
      }
      if (remaining.has(line) && commit) {
        result[line] = commit;
        remaining.delete(line);
      }
      if (!remaining.size) {
        stopped = true;
        child.kill();
        break;
      }
    }
    const code = await complete;
    if (timedOut || (!stopped && code !== 0) || remaining.size)
      throw new Error(
        "Publication evidence has no canonical commit or history is unavailable.",
      );
    return result;
  } finally {
    clearTimeout(timer);
    lines.close();
    if (!child.killed) child.kill();
  }
}
