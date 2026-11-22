import { removeReadmeNoise } from "../catalog/readme-preparation.mjs";
import { repositoryProvider } from "../catalog/repository-provider.mjs";
import { isRepositoryIdentity } from "./source-identity.mjs";

const messages = {
  "readme-missing": "The repository has no README on its default branch.",
  "readme-placeholder":
    "The repository README does not explain what the project is or what it provides.",
};

export function readmeRejection(code) {
  return Object.hasOwn(messages, code)
    ? { status: "rejected", code, message: messages[code] }
    : null;
}

const ancillaryHeading =
  /^(?:licen[cs]e|installation|how to install|requirements|prerequisites|credits?|acknowledg(?:e)?ments?|changelog|contributing|support|disclaimer|roadmap|sponsors?|라이[선센]스|설치|许可证|许可|安装|ライセンス|インストール)(?:\b|$|[\s·:：])/iu;
const placeholder =
  /^(?:readme|description|overview|features?|todo|tbd|wip|work in progress|coming soon|under (?:construction|development)|documentation (?:is )?(?:coming soon|in progress)|(?:a |an |this is (?:a |an )?)?(?:simple |basic )?(?:sillytavern |tavernary )?(?:extension|plugin|preset|project|frontend)(?: for sillytavern)?|sillytavern\s*(?:확장(?:\s*프로그램)?(?:입니다)?|扩展|插件|拡張(?:機能)?))[\s.!…:：-]*$/iu;

export function hasSubstantiveReadme(raw, projectName = "") {
  const lines = removeReadmeNoise(raw)
    .replace(/~~~[\s\S]*?~~~/gu, "")
    .replace(/\[!\[[^\]]*\]\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\[[^\]]*\]/gu, "")
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu,
      (_, depth, heading) =>
        "\n" + "#".repeat(Number(depth)) + " " + heading.trim() + "\n",
    )
    .replace(/<a\b[^>]*>\s*<\/a>/giu, "")
    .replace(/^[^\S\n]*\[[^\]\n]+\]:[^\n]*$/gmu, "")
    .replace(
      /^[^\S\n]*(?:[-*+]\s+)?\[[^\]\n]+\](?:\([^)\n]*\)|\[[^\]\n]*\])[^\S\n]*$/gmu,
      "",
    )
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)|\[([^\]\n]+)\]\[[^\]\n]*\]/gu, "$1$2")
    .replace(/<[^>]+>/gu, "")
    .replace(/https?:\/\/\S+/giu, "")
    .split("\n");

  let ignoredHeadingDepth = Infinity;
  const descriptiveLines = [];
  for (const [index, line] of lines.entries()) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(line.trim());
    const underline =
      line.trim() && /^\s*(=+|-{2,})\s*$/u.exec(lines[index + 1] ?? "");
    if (heading || underline) {
      const depth = heading
        ? heading[1].length
        : underline[1][0] === "="
          ? 1
          : 2;
      if (depth <= ignoredHeadingDepth) {
        ignoredHeadingDepth = ancillaryHeading.test(heading?.[2] ?? line.trim())
          ? depth
          : Infinity;
      }
      continue;
    }
    if (ignoredHeadingDepth !== Infinity) continue;

    const prose = line.replace(/^[\s>*_#\x60~|+-]+|[\s*_#\x60~|]+$/gu, "");
    if (
      !prose ||
      prose.toLowerCase() === projectName.toLowerCase() ||
      placeholder.test(prose) ||
      /^(?:todo|tbd)(?:\s*[:：-]|\s+add\b)|^(?:add|insert|write)\s+(?:a\s+)?(?:project\s+)?description\b|^(?:(?:this|the) (?:project|repository) is (?:currently )?)?(?:a )?work in progress\b/iu.test(
        prose,
      ) ||
      /^(?:copyright\b|all rights reserved\b|SPDX-License-Identifier:|©|no longer maintained\b|(?:install|clone|download)(?:\b|:)|(?:original|upstream|source|원본)\s+(?:repo(?:sitory)?|저장소)\s*[:：])/iu.test(
        prose,
      )
    ) {
      continue;
    }
    descriptiveLines.push(prose);
  }
  const text = descriptiveLines.join(" ");
  return (
    (text.match(/\p{L}/gu)?.length ?? 0) >= 18 ||
    (text.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    )?.length ?? 0) >= 8
  );
}

async function githubReadme(identity, request) {
  const endpoint = "/repositories/" + identity.repositoryId;
  try {
    return await request(endpoint + "/readme");
  } catch (error) {
    if (error?.status !== 404) throw error;
    const repository = await request(endpoint);
    if (repository?.id !== identity.repositoryId || repository.private) {
      throw error;
    }
    return null;
  }
}

export async function inspectSubmissionReadme(
  identity,
  { request, providers },
) {
  if (!isRepositoryIdentity(identity)) return null;
  try {
    const readme =
      identity.provider === "github" && !providers?.github?.readRootReadme
        ? await githubReadme(identity, request)
        : await repositoryProvider(identity.provider, providers).readRootReadme(
            {
              repository: identity.repository,
            },
          );
    if (readme === null) return readmeRejection("readme-missing");
    const encoded =
      typeof readme?.content === "string"
        ? readme.content.replace(/\s/gu, "")
        : null;
    if (
      readme?.encoding !== "base64" ||
      typeof encoded !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        encoded,
      )
    ) {
      throw new Error("Invalid README response.");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(encoded, "base64"),
    );
    return hasSubstantiveReadme(text, identity.name)
      ? null
      : readmeRejection("readme-placeholder");
  } catch {
    return {
      status: "retryable",
      code: "readme-fetch-failed",
      message: "Tavernary could not verify the repository README.",
    };
  }
}
