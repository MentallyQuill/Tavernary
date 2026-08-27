import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { expect, test } from "vitest";

const roots = ["src/app", "src/components", "src/features"];
const publicContentRoots = [
  ...roots,
  "docs/guides",
  "docs/contributing",
  ".github/ISSUE_TEMPLATE",
];
const publicContentFiles = ["README.md", "docs/README.md"];
const publicContentExtensions = new Set([".md", ".tsx", ".yml"]);
const collectiveVoice = /\b(?:we|we'll|we're|we've|our|ours|us)\b/g;
const teamImplication =
  /\b(?:staff|Tavernary(?:'s)? (?:maintainers|team|owners|admins)|contact maintainers|maintainer review|for maintainers to review)\b/gi;
const internalRoleOrPermission = [
  /\bTavernary(?:(?:&apos;|')s)? (?:staff|owners?|admins?|administrators?|maintainers?|moderators?|reviewers?)\b/giu,
  /\b(?:reviewed|trusted|authorized) (?:Tavernary )?(?:staff|maintainers?|admins?|administrators?)\b/giu,
  /\b(?:staff|Tavernary) (?:authority|maintenance|edit|review|wording)\b/giu,
  /\bmaintainer (?:approval|review|actions?|contracts?|procedures?|must reconcile|handles the next step)\b/giu,
  /\bhuman-reviewed\b/giu,
  /\breviewed Tavernary authority\b/giu,
  /\bTavernary reviews(?: and approves)? the complete\b/giu,
  /\bAvailable to the verified repository owner or Tavernary\b/giu,
  /\bTavernary may (?:correct|hide|neutralize|pause|remove|update)\b/giu,
  /\b(?:owner|repository owner|verified project owner|verified repository owner) or Tavernary (?:can|may|supplies?)\b/giu,
  /\breviewed by Tavernary\b/giu,
  /\bTavernary will use this manifest\b/giu,
  /\b(?:what (?:should Tavernary review|Tavernary should review)|needs another Tavernary review)\b/giu,
  /\band maintainers can use\b/giu,
  /\bfor contributors and maintainers\b/giu,
];

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

function contentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return contentFiles(path);
    return entry.isFile() && publicContentExtensions.has(extname(path))
      ? [path]
      : [];
  });
}

test("keeps Tavernary-owned interface copy in a singular or neutral voice", () => {
  const violations = roots.flatMap((root) =>
    tsxFiles(root).flatMap((path) => {
      const lines = readFileSync(path, "utf8").split(/\r?\n/u);
      return lines.flatMap((line, index) => {
        const matches = [
          ...line.matchAll(collectiveVoice),
          ...line.matchAll(teamImplication),
        ];
        return matches.map(
          (match) =>
            `${relative(process.cwd(), path)}:${index + 1}: ${match[0]}`,
        );
      });
    }),
  );

  expect(violations).toEqual([]);
});

test("keeps Tavernary staff roles and internal permissions out of public content", () => {
  const paths = [
    ...publicContentFiles,
    ...publicContentRoots.flatMap((root) => contentFiles(root)),
  ];
  const violations = paths.flatMap((path) => {
    const lines = readFileSync(path, "utf8").split(/\r?\n/u);
    return lines.flatMap((line, index) =>
      internalRoleOrPermission.flatMap((pattern) =>
        [...line.matchAll(pattern)].map(
          (match) =>
            `${relative(process.cwd(), path)}:${index + 1}: ${match[0]}`,
        ),
      ),
    );
  });

  expect(violations).toEqual([]);
});
