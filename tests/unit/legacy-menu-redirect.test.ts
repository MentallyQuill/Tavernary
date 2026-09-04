import { describe, expect, test } from "vitest";

import { menuPathForLegacyHelpLocation } from "@/features/menu/components/legacy-menu-redirect";

describe("menuPathForLegacyHelpLocation", () => {
  test("preserves the route, query string, and hash", () => {
    expect(
      menuPathForLegacyHelpLocation(
        "/help/report-project/",
        "?project=directive",
        "#details",
      ),
    ).toBe("/menu/report-project/?project=directive#details");
  });

  test("preserves a configured deployment base path", () => {
    expect(
      menuPathForLegacyHelpLocation(
        "/Tavernary/help/manage-project/",
        "?project=directive",
        "",
      ),
    ).toBe("/Tavernary/menu/manage-project/?project=directive");
  });
});
