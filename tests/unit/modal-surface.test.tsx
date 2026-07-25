import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useModalSurface } from "@/hooks/use-modal-surface";

function ModalHarness({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useModalSurface({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: headingRef,
    inertSelectors: ["[data-testid='background']"],
    onDismiss: () => {
      onDismiss();
      setOpen(false);
    },
  });

  return (
    <>
      <main data-testid="background">
        <button type="button">Open filters</button>
      </main>
      {open ? (
        <section ref={dialogRef} role="dialog" aria-labelledby="filter-heading">
          <h2 ref={headingRef} id="filter-heading" tabIndex={-1}>
            Filters
          </h2>
          <button type="button">First control</button>
          <button type="button">Last control</button>
        </section>
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.className = "";
});

describe("useModalSurface", () => {
  test("locks and restores the background around Escape dismissal", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<ModalHarness onDismiss={onDismiss} />);

    expect(document.body).toHaveClass("sheet-open");
    expect(screen.getByTestId("background")).toHaveAttribute("inert");
    expect(screen.getByRole("heading", { name: "Filters" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveClass("sheet-open");
    expect(screen.getByTestId("background")).not.toHaveAttribute("inert");
  });

  test("wraps keyboard focus within the modal", async () => {
    const user = userEvent.setup();
    render(<ModalHarness onDismiss={() => undefined} />);

    screen.getByRole("button", { name: "Last control" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First control" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Last control" })).toHaveFocus();
  });
});
