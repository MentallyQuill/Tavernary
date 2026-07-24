import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function applyKitWithdrawal({ kit, actorId, now }) {
  if (kit.author.github_user_id !== actorId) {
    throw new Error("Only the Kit author may withdraw this Kit.");
  }
  return { ...kit, status: "withdrawn", withdrawn_at: now };
}

function parseKitId(body) {
  const section = body
    .split(/^### /m)
    .slice(1)
    .find((value) => value.startsWith("Kit ID"));
  return section?.split(/\r?\n/).slice(1).join("\n").trim() ?? "";
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (!event.issue?.title?.startsWith("[Kit withdrawal]")) return;
  const kitId = parseKitId(event.issue.body ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(kitId)) {
    throw new Error("Withdrawal issue does not contain a valid Kit ID.");
  }
  const path = resolve("data/registry/kits", `${kitId}.json`);
  const kit = JSON.parse(await readFile(path, "utf8"));
  const tombstone = applyKitWithdrawal({
    kit,
    actorId: event.issue.user.id,
    now: new Date().toISOString(),
  });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(tombstone, null, 2)}\n`);
  await rename(temporary, path);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
