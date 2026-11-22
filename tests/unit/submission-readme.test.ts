import { expect, test, vi } from "vitest";

import {
  hasSubstantiveReadme,
  inspectSubmissionReadme,
} from "../../scripts/submissions/submission-readme.mjs";

const github = {
  kind: "repository" as const,
  provider: "github" as const,
  canonicalUrl: "https://github.com/owner/Ghostpen",
  repository: "owner/Ghostpen",
  repositoryId: 123,
  owner: "owner",
  name: "Ghostpen",
};

test.each([
  ["# Ghostpen", false],
  ["\n", false],
  ["Ghostpen\n========\n\nComing soon!", false],
  [
    "# Ghostpen\n\n[![Build](badge.svg)](ci)\n\n## Installation\nUse the extension manager to install the project.",
    false,
  ],
  [
    "# Ghostpen\n\n## License\nDistributed under the Apache Software License.",
    false,
  ],
  [
    "# Ghostpen\n\nLicense\n-------\nDistributed under the Apache Software License.",
    false,
  ],
  [
    "# Ghostpen\n\n[Complete project documentation and examples](https://example.com/docs)",
    false,
  ],
  ["# Ghostpen\n\nTODO: Add a short description of the project.", false],
  [
    "# Ghostpen\n\nSillyTavern 확장입니다.\n\n원본 저장소: https://github.com/owner/repo\n\n## 라이센스\n원작자를 표시해 주세요.",
    false,
  ],
  ["# Ghostpen\n\n- Adds searchable notes to chats.", true],
  ["# Ghostpen\n\n聊天记录自动归档。", true],
])("checks descriptive README content in %j", (text, expected) => {
  expect(hasSubstantiveReadme(text, "Ghostpen")).toBe(expected);
});

test.each([true, false])(
  "only rejects a GitHub README 404 when the repository is still public (%s)",
  async (publicRepository) => {
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/readme")) {
        throw Object.assign(new Error("Not Found"), { status: 404 });
      }
      return { id: 123, private: !publicRepository };
    });
    await expect(
      inspectSubmissionReadme(github, { request }),
    ).resolves.toMatchObject({
      status: publicRepository ? "rejected" : "retryable",
      code: publicRepository ? "readme-missing" : "readme-fetch-failed",
    });
    expect(request.mock.calls).toEqual([
      ["/repositories/123/readme"],
      ["/repositories/123"],
    ]);
  },
);

test("checks Codeberg's upstream README without using GitHub", async () => {
  const codeberg = { ...github, provider: "codeberg" as const };
  const readRootReadme = vi.fn(async () => null);
  const request = vi.fn();
  await expect(
    inspectSubmissionReadme(codeberg, {
      request,
      providers: { codeberg: { resolve: vi.fn(), readRootReadme } },
    }),
  ).resolves.toMatchObject({ status: "rejected", code: "readme-missing" });
  expect(readRootReadme).toHaveBeenCalledWith({
    repository: codeberg.repository,
  });
  expect(request).not.toHaveBeenCalled();
});
