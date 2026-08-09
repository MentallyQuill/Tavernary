import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "vitest";

const roots = ["src/app", "src/components", "src/features"];
const collectiveVoice = /\b(?:we|we'll|we're|we've|our|ours|us)\b/g;
const teamImplication =
  /\b(?:staff|Tavernary(?:'s)? (?:maintainers|team|owners|admins)|contact maintainers|maintainer review|for maintainers to review)\b/gi;

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
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
