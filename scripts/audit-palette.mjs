import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import colorNames from "color-name";

export const APPROVED_HEX = [
  "#07181D",
  "#0B2229",
  "#102B33",
  "#173740",
  "#284A52",
  "#3B6068",
  "#FFFFFF",
  "#F3F1E8",
  "#CBD6D3",
  "#849A9E",
  "#D62839",
  "#57C5A3",
  "#E18A24",
];

const APPROVED_HEX_SET = new Set(
  APPROVED_HEX.map((color) => color.toLowerCase()),
);
const AUDITED_EXTENSIONS = new Set([".css", ".tsx", ".svg"]);
const REPOSITORY_ROOT = import.meta.url.startsWith("file:")
  ? resolve(fileURLToPath(import.meta.url), "..", "..")
  : process.cwd();
const ALLOWED_COLOR_MIX =
  /color-mix\(\s*in\s+srgb\s*,\s*var\(\s*--color-kind-preset\s*\)\s+var\(\s*--commit-freshness\s*\)\s*,\s*var\(\s*--color-muted\s*\)\s*\)/gi;
const NEUTRAL_KEYWORDS = new Set(["transparent", "currentcolor", "inherit"]);
const NAMED_COLORS = Object.keys(colorNames).sort(
  (left, right) => right.length - left.length,
);
const NAMED_COLOR_EXPRESSION = new RegExp(
  `(?<![\\w-])(?:${NAMED_COLORS.join("|")})(?![\\w-])`,
  "gi",
);
const COLOR_PROPERTY =
  "(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|stop-color|flood-color|lighting-color|text-decoration-color|caret-color|accent-color|column-rule-color|backgroundColor|borderColor|outlineColor|boxShadow|textShadow|stopColor|floodColor|lightingColor|textDecorationColor|caretColor|accentColor|columnRuleColor)";
const COLOR_DECLARATION_EXPRESSION = new RegExp(
  `\\b${COLOR_PROPERTY}\\s*:\\s*([^;}\\n]+)`,
  "gi",
);
const COLOR_ATTRIBUTE_EXPRESSION =
  /\b(?:fill|stroke|color|stopColor|floodColor|lightingColor)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/gi;

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function addMatches(violations, file, source, expression, messageForMatch) {
  for (const match of source.matchAll(expression)) {
    violations.push({
      file,
      line: lineNumber(source, match.index ?? 0),
      value: match[0],
      message: messageForMatch(match),
    });
  }
}

function withoutComments(file, source) {
  const result = [...source];
  const supportsLineComments = extname(file).toLowerCase() === ".tsx";
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    const isBlockComment = character === "/" && next === "*";
    const isLineComment =
      supportsLineComments && character === "/" && next === "/";
    if (!isBlockComment && !isLineComment) continue;

    const startsAt = index;
    if (isBlockComment) {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index = Math.min(index + 1, source.length - 1);
    } else {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      index -= 1;
    }

    for (
      let commentIndex = startsAt;
      commentIndex <= index;
      commentIndex += 1
    ) {
      if (result[commentIndex] !== "\n") result[commentIndex] = " ";
    }
  }

  return result
    .join("")
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));
}

function addNamedColorMatches(violations, file, source) {
  const authoredSource = withoutComments(file, source);
  const valueRanges = [];

  for (const match of authoredSource.matchAll(COLOR_DECLARATION_EXPRESSION)) {
    const value = match[1];
    valueRanges.push({
      value,
      index: (match.index ?? 0) + match[0].indexOf(value),
    });
  }

  for (const match of authoredSource.matchAll(COLOR_ATTRIBUTE_EXPRESSION)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    valueRanges.push({
      value,
      index: (match.index ?? 0) + match[0].indexOf(value),
    });
  }

  for (const range of valueRanges) {
    const colorValue = range.value.replace(/\burl\([^)]*\)/gi, (url) =>
      " ".repeat(url.length),
    );
    for (const match of colorValue.matchAll(NAMED_COLOR_EXPRESSION)) {
      if (NEUTRAL_KEYWORDS.has(match[0].toLowerCase())) continue;
      violations.push({
        file,
        line: lineNumber(source, range.index + (match.index ?? 0)),
        value: match[0],
        message: "Named colors are not allowed",
      });
    }
  }
}

function isBinaryOpacity(value) {
  return /^(?:0(?:\.0+)?|1(?:\.0+)?)$/.test(value.trim());
}

function addOpacityMatches(violations, file, source) {
  const expressions = [
    /\b(?:opacity|fillOpacity|strokeOpacity|floodOpacity|stopOpacity|fill-opacity|stroke-opacity|flood-opacity|stop-opacity)\s*:\s*([^;}\n]+)/gi,
    /\b(?:opacity|fillOpacity|strokeOpacity|floodOpacity|stopOpacity|fill-opacity|stroke-opacity|flood-opacity|stop-opacity)\s*=\s*["']([^"']+)["']/gi,
    /\bopacity\s*\(\s*([^)]+)\)/gi,
  ];

  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) {
      if (isBinaryOpacity(match[1])) continue;
      violations.push({
        file,
        line: lineNumber(source, match.index ?? 0),
        value: match[0],
        message: "Partial opacity is not allowed",
      });
    }
  }
}

export function auditSource(file, source) {
  const violations = [];
  const authoredSource = withoutComments(file, source);

  addMatches(violations, file, authoredSource, /#[\da-f]{3,8}\b/gi, (match) =>
    APPROVED_HEX_SET.has(match[0].toLowerCase())
      ? ""
      : "Hex color is outside the production palette",
  );

  for (let index = violations.length - 1; index >= 0; index -= 1) {
    if (!violations[index].message) {
      violations.splice(index, 1);
    }
  }

  addMatches(
    violations,
    file,
    authoredSource,
    /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|device-cmyk|light-dark)\s*\([^)]*\)/gi,
    () => "Functional color notation is not allowed",
  );

  const sourceWithoutAllowedMix = authoredSource.replace(
    ALLOWED_COLOR_MIX,
    (match) => match.replace(/[^\n]/g, " "),
  );
  addMatches(
    violations,
    file,
    sourceWithoutAllowedMix,
    /color-mix\s*\(/gi,
    () => "Only the approved commit-age color mix is allowed",
  );

  addNamedColorMatches(violations, file, source);
  addOpacityMatches(violations, file, authoredSource);

  return violations.filter((violation) => violation.message);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (AUDITED_EXTENSIONS.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

export async function auditProductionPalette(root = REPOSITORY_ROOT) {
  const sourceFiles = await collectFiles(resolve(root, "src"));
  const publicFiles = await collectFiles(resolve(root, "public"));
  const files = [...sourceFiles, ...publicFiles];
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    violations.push(...auditSource(file, source));
  }

  return violations;
}

async function main() {
  const violations = await auditProductionPalette();

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line} ${violation.message}: ${violation.value}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log("Production palette verified");
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPoint) {
  await main();
}
