import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  LegacyMenuRedirect,
  menuPathForLegacyHelpLocation,
} from "@/features/menu/components/legacy-menu-redirect";

afterEach(() => {
  cleanup();
});

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

test("renders the exact canonical destination when JavaScript is unavailable", () => {
  render(<LegacyMenuRedirect destination="/menu/security/" />);

  expect(screen.getByRole("main")).toHaveAttribute(
    "data-menu-destination",
    "/menu/security/",
  );
  expect(
    screen.getByRole("link", { name: "Open the Menu page" }),
  ).toHaveAttribute("href", "/menu/security");
});
