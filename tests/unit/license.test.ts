import { describe, expect, test } from "vitest";

import cases from "../fixtures/github/license-cases.json";
import { classifyRootLicense } from "@/lib/github/license";

describe("root license classification", () => {
  test("recognizes an OSI-approved root license", () => {
    expect(
      classifyRootLicense([{ path: "LICENSE", content: cases.mit }]),
    ).toEqual({
      status: "osi-approved",
      spdxId: "MIT",
      sourcePath: "LICENSE",
    });
  });

  test("does not infer a license from package metadata", () => {
    expect(
      classifyRootLicense([
        { path: "package.json", content: '{"license":"MIT"}' },
      ]),
    ).toEqual({
      status: "missing",
      spdxId: null,
      sourcePath: null,
    });
  });

  test("marks an unrecognized root license as proprietary", () => {
    expect(
      classifyRootLicense([
        { path: "LICENSE.txt", content: cases.proprietary },
      ]),
    ).toEqual({
      status: "proprietary",
      spdxId: null,
      sourcePath: "LICENSE.txt",
    });
  });
});
