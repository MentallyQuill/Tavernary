import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function snapshotForFailure(previous, now) {
  return previous
    ? { ...previous, stale_since: previous.stale_since ?? now }
    : null;
}

export async function refreshKitReactions({
  kits,
  snapshots,
  blockedUsers,
  fetchPage,
  now,
}) {
  const previousByKit = new Map(
    snapshots.map((snapshot) => [snapshot.kit_id, snapshot]),
  );
  const blockedIds = new Set(
    blockedUsers.blocked.map((blocked) => blocked.github_user_id),
  );
  const results = [];

  for (const kit of kits) {
    const previous = previousByKit.get(kit.id);
    if (kit.status !== "published") {
      if (previous) {
        results.push({
          ...previous,
          refreshed_at: now,
          stale_since: null,
          supporters: previous.supporters.map((supporter) => ({
            ...supporter,
            active: false,
          })),
        });
      }
      continue;
    }

    try {
      const reactions = [];
      for (let page = 1; ; page += 1) {
        const batch = await fetchPage({ kit, page, perPage: 100 });
        reactions.push(...batch);
        if (batch.length < 100) break;
      }

      const ledger = new Map(
        (previous?.supporters ?? []).map((supporter) => [
          supporter.github_user_id,
          { ...supporter, active: false },
        ]),
      );
      for (const reaction of reactions) {
        if (
          reaction.content !== "+1" ||
          reaction.user?.type === "Bot" ||
          blockedIds.has(reaction.user?.id)
        ) {
          continue;
        }
        const stored = ledger.get(reaction.user.id);
        ledger.set(reaction.user.id, {
          github_user_id: reaction.user.id,
          login: reaction.user.login,
          first_reacted_at: stored?.first_reacted_at ?? reaction.created_at,
          active: true,
        });
      }
      for (const blockedId of blockedIds) {
        const blocked = ledger.get(blockedId);
        if (blocked) ledger.set(blockedId, { ...blocked, active: false });
      }
      results.push({
        schema_version: 1,
        kit_id: kit.id,
        source_issue_number: kit.source_issue_number,
        refreshed_at: now,
        stale_since: null,
        supporters: [...ledger.values()].sort(
          (left, right) => left.github_user_id - right.github_user_id,
        ),
      });
    } catch {
      const stale = snapshotForFailure(previous, now);
      if (stale) results.push(stale);
    }
  }

  return results;
}

async function readJsonDirectory(path) {
  let files;
  try {
    files = (await readdir(path))
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(path, file), "utf8")),
    ),
  );
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function githubReactionPage({ kit, page, perPage }) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${kit.source_issue_number}/reactions?per_page=${perPage}&page=${page}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "Tavernary-kit-reactions",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Unable to refresh Kit ${kit.id} reactions: ${response.status}`,
    );
  }
  return response.json();
}

async function main() {
  const [kits, snapshots, blockedUsers] = await Promise.all([
    readJsonDirectory(resolve("data/registry/kits")),
    readJsonDirectory(resolve("data/snapshots/github/kits")),
    readFile("data/moderation/blocked-github-users.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const refreshed = await refreshKitReactions({
    kits,
    snapshots,
    blockedUsers,
    fetchPage: githubReactionPage,
    now: new Date().toISOString(),
  });
  await Promise.all(
    refreshed.map((snapshot) =>
      atomicWrite(
        resolve("data/snapshots/github/kits", `${snapshot.kit_id}.json`),
        snapshot,
      ),
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
