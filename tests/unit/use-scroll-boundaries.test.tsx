import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { expect, test } from "vitest";

import {
  readScrollBoundaries,
  useScrollBoundaries,
} from "@/features/kits/use-scroll-boundaries";

test("reports only directions containing hidden content", () => {
  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 0,
    }),
  ).toEqual({ canScrollDown: true, canScrollUp: false });

  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 300,
    }),
  ).toEqual({ canScrollDown: true, canScrollUp: true });

  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 600,
    }),
  ).toEqual({ canScrollDown: false, canScrollUp: true });
});

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const boundaries = useScrollBoundaries(ref, true, "kit:3");
  return (
    <div
      ref={ref}
      data-testid="scroller"
      data-up={boundaries.canScrollUp}
      data-down={boundaries.canScrollDown}
    />
  );
}

test("updates rendered boundary state on scroll", () => {
  render(<Harness />);
  const scroller = screen.getByTestId("scroller");

  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 900 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  });

  fireEvent.scroll(scroller);
  expect(scroller).toHaveAttribute("data-up", "false");
  expect(scroller).toHaveAttribute("data-down", "true");

  scroller.scrollTop = 600;
  fireEvent.scroll(scroller);
  expect(scroller).toHaveAttribute("data-up", "true");
  expect(scroller).toHaveAttribute("data-down", "false");
});
