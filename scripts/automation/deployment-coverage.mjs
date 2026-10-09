import { execFileSync } from "node:child_process";
const sha = /^[a-f0-9]{40}$/u;
export function readDeploymentCoverage({ root, sourceShas, candidates }) {
  if (
    !Array.isArray(sourceShas) ||
    sourceShas.length > 2000 ||
    !Array.isArray(candidates) ||
    candidates.length > 100000 ||
    [...sourceShas, ...candidates].some(
      (value) => typeof value !== "string" || !sha.test(value),
    )
  )
    throw new Error("Publication coverage input is invalid.");
  const wanted = new Set(candidates),
    covered = new Set(),
    sources = [...new Set(sourceShas)];
  for (let offset = 0; offset < sources.length; offset += 64) {
    const history = execFileSync(
      "git",
      ["rev-list", ...sources.slice(offset, offset + 64), "--"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const line of history.trim().split("\n")) {
      if (!sha.test(line))
        throw new Error("Publication coverage history is invalid.");
      if (wanted.has(line)) covered.add(line);
    }
  }
  return [...covered].sort();
}
