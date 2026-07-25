import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { KitDraftAccess } from "@/features/kits/components/kit-draft-access";

afterEach(cleanup);

describe("KitDraftAccess", () => {
  test("renders nothing without a draft status", () => {
    const { container } = render(
      <KitDraftAccess variant="rail" status={null} onOpen={() => undefined} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("gives the desktop rail a cumulative accessible name", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    render(
      <KitDraftAccess
        variant="rail"
        status={{ phase: "settled", draftCount: 7 }}
        onOpen={onOpen}
      />,
    );

    const open = screen.getByRole("button", {
      name: "Open Kit Builder, 7 projects in draft",
    });
    expect(open).toHaveClass("kit-builder-toggle");
    const rail = open.closest(".kit-builder-rail");
    expect(rail).toHaveTextContent("Kit Builder");
    expect(rail).toHaveTextContent("7 projects in draft");
    fireEvent.pointerEnter(open);
    expect(
      screen.getByRole("tooltip", { name: "Open Kit Builder" }),
    ).toBeVisible();
    await user.click(open);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  test("renders the mobile draft pill with the Kits icon and count", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <KitDraftAccess
        variant="pill"
        status={{ phase: "settled", draftCount: 2 }}
        onOpen={onOpen}
      />,
    );

    const pill = screen.getByRole("button", {
      name: "Open Kit Builder, 2 projects in draft",
    });
    expect(pill).toHaveClass("kit-draft-pill");
    expect(pill.querySelector('[data-icon="kit-builder"]')).not.toBeNull();
    expect(pill).toHaveTextContent("Kit draft");
    expect(pill).toHaveTextContent("2 projects in draft");
    fireEvent.pointerEnter(pill);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(pill);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  test("shows the transient net-added status while retaining cumulative access", () => {
    render(
      <KitDraftAccess
        variant="pill"
        status={{ phase: "added", addedCount: 3, draftCount: 7 }}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByText("3 projects added")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Open Kit Builder, 7 projects in draft",
      }),
    ).toBeVisible();
  });
});
