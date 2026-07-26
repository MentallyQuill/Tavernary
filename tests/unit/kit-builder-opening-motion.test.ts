import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("reveals a final-width desktop Kit Builder canvas during track expansion", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");

  expect(css).toMatch(
    /\.catalog-layout\s*\{[^}]*--kit-builder-expanded-width:\s*clamp\(280px,\s*22vw,\s*340px\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel-header,\s*\.kit-builder-panel-body-frame\s*\{[^}]*width:\s*calc\(\s*var\(--kit-builder-expanded-width\) - var\(--kit-builder-content-inset\) -\s*var\(--kit-builder-content-inset\) - 1px\s*\)[^}]*min-width:\s*calc\(\s*var\(--kit-builder-expanded-width\) - var\(--kit-builder-content-inset\) -\s*var\(--kit-builder-content-inset\) - 1px\s*\)[^}]*align-self:\s*flex-end/s,
  );
  expect(responsive).toMatch(
    /@media \(min-width:\s*761px\) and \(max-width:\s*1050px\)[\s\S]*?\.catalog-layout\s*\{[^}]*--kit-builder-expanded-width:\s*clamp\(280px,\s*32vw,\s*340px\)/,
  );
  expect(responsive).toMatch(
    /@media \(max-width:\s*760px\)[\s\S]*?\.kit-builder-panel-header,\s*\.kit-builder-panel-body-frame\s*\{[^}]*width:\s*auto[^}]*min-width:\s*0[^}]*align-self:\s*stretch/s,
  );
});
