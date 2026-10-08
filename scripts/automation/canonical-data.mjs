import { createHash } from "node:crypto";
import { githubFailureStatus } from "./github-inventory.mjs";

const shaPattern = /^[a-f0-9]{40}$/u;
function validateContext(repository, sha) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !shaPattern.test(sha ?? "")
  )
    throw new Error("Canonical GitHub context is invalid.");
}
function validateFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > 256)
    throw new Error("Canonical data batch is invalid.");
  const seen = new Set();
  let total = 0;
  for (const file of files) {
    if (
      !/^(?:data\/(?:registry\/(?:projects|sources|kits)|snapshots\/(?:github(?:\/kits)?|codeberg|install|policy-review)|maintenance\/automation\/(?:operations|publications|metadata|deployments|model-budgets)|security)\/[a-z0-9]+(?:-[a-z0-9]+)*\.json|public\/catalog\/tavernary-catalog(?:-v8)?\.json)$/u.test(
        file.path ?? "",
      ) ||
      seen.has(file.path) ||
      file.type !== "file" ||
      typeof file.content !== "string" ||
      file.bytes < 1 ||
      file.bytes > 8_388_608 ||
      Buffer.byteLength(file.content) !== file.bytes ||
      createHash("sha256").update(file.content).digest("hex") !== file.sha256
    )
      throw new Error("Canonical file is invalid.");
    seen.add(file.path);
    total += file.bytes;
    const data = JSON.parse(file.content);
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      total > 33_554_432
    )
      throw new Error("Canonical data exceeds its contract.");
  }
}
export async function commitCanonicalData({
  gh,
  repository,
  expectedMainSha,
  files,
  message,
}) {
  validateContext(repository, expectedMainSha);
  validateFiles(files);
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 240 ||
    /[\r\n]/u.test(message)
  )
    throw new Error("Canonical commit message is invalid.");
  const root = `repos/${repository}/git`;
  const parent = JSON.parse(
    await gh(["api", `${root}/commits/${expectedMainSha}`]),
  );
  if (
    parent.sha !== expectedMainSha ||
    !shaPattern.test(parent.tree?.sha ?? "")
  )
    throw new Error("Canonical parent is invalid.");
  const tree = [];
  for (const file of files) {
    const blob = JSON.parse(
      await gh(
        ["api", "--method", "POST", `${root}/blobs`, "--input", "-"],
        JSON.stringify({
          encoding: "base64",
          content: Buffer.from(file.content).toString("base64"),
        }),
      ),
    );
    if (!shaPattern.test(blob.sha ?? ""))
      throw new Error("Canonical blob is invalid.");
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = JSON.parse(
    await gh(
      ["api", "--method", "POST", `${root}/trees`, "--input", "-"],
      JSON.stringify({ base_tree: parent.tree.sha, tree }),
    ),
  );
  if (!shaPattern.test(newTree.sha ?? ""))
    throw new Error("Canonical tree is invalid.");
  const commit = JSON.parse(
    await gh(
      ["api", "--method", "POST", `${root}/commits`, "--input", "-"],
      JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [expectedMainSha],
      }),
    ),
  );
  if (!shaPattern.test(commit.sha ?? ""))
    throw new Error("Canonical commit is invalid.");
  let reference;
  try {
    reference = JSON.parse(
      await gh(
        ["api", "--method", "PATCH", `${root}/refs/heads/main`, "--input", "-"],
        JSON.stringify({ sha: commit.sha, force: false }),
      ),
    );
  } catch (error) {
    if (
      githubFailureStatus(error) === 422 ||
      githubFailureStatus(error) === 409
    )
      throw Object.assign(new Error("Canonical main advanced."), {
        code: "input-superseded",
      });
    throw error;
  }
  if (
    reference.ref !== "refs/heads/main" ||
    reference.object?.sha !== commit.sha
  )
    throw new Error("Canonical main publication is unconfirmed.");
  return { sha: commit.sha };
}
export async function verifyCanonicalData({
  gh,
  repository,
  sha,
  mainSha,
  files,
}) {
  validateContext(repository, sha);
  validateContext(repository, mainSha);
  validateFiles(files);
  if (sha !== mainSha) {
    const comparison = JSON.parse(
      await gh(["api", `repos/${repository}/compare/${sha}...${mainSha}`]),
    );
    if (
      !["ahead", "identical"].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== sha
    )
      return false;
  }
  for (const file of files) {
    let blob = JSON.parse(
      await gh([
        "api",
        `repos/${repository}/contents/${file.path}?ref=${mainSha}`,
      ]),
    );
    if (blob.type !== "file") return false;
    if (blob.encoding === "none") {
      if (!shaPattern.test(blob.sha ?? "")) return false;
      const expectedBlobSha = blob.sha;
      blob = JSON.parse(
        await gh(["api", `repos/${repository}/git/blobs/${expectedBlobSha}`]),
      );
      if (blob.sha !== expectedBlobSha || blob.size !== file.bytes)
        return false;
    }
    if (
      blob.encoding !== "base64" ||
      typeof blob.content !== "string" ||
      blob.content.length > 11_535_000 ||
      Buffer.from(blob.content, "base64").byteLength !== file.bytes ||
      createHash("sha256")
        .update(Buffer.from(blob.content, "base64"))
        .digest("hex") !== file.sha256
    )
      return false;
  }
  return true;
}
