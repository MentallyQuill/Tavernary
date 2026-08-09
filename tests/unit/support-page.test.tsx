import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import SupportPage from "@/app/support/page";

afterEach(() => cleanup());

test("explains Tavernary's operating target, costs, and rollover policy", () => {
  render(<SupportPage />);

  expect(
    screen.getByRole("heading", { name: "Support Tavernary" }),
  ).toBeInTheDocument();
  expect(screen.getByText("$12/month", { exact: true })).toBeInTheDocument();
  expect(
    screen.getByText(
      /\$12 target is a simple community-funding goal.*owner intends to cover costs above it for now.*\$13\.50 model figure.*uncached estimate/i,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/anything above the current month.*carries forward/i),
  ).toBeInTheDocument();

  const drivers = screen.getByRole("list", { name: "Operating cost drivers" });
  const items = within(drivers).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent(/security scanning/i);
  expect(items[1]).toHaveTextContent(/update reassessment/i);
  expect(items[2]).toHaveTextContent(/new-project intake/i);
});

test("labels the initial monthly usage numbers as estimates", () => {
  render(<SupportPage />);

  expect(screen.getByText("Estimated", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("45M", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("4,000", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("9:1", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("$13.50", { exact: true })).toBeInTheDocument();
  expect(screen.getByText(/July 30, 2026 pricing/i)).toBeInTheDocument();
});

test("describes model selection as Tavernary's observed result", () => {
  render(<SupportPage />);

  expect(screen.getByText(/strict structured output/i)).toBeInTheDocument();
  expect(screen.getByText(/DeepSeek V4 and GLM-5.2/i)).toBeInTheDocument();
  expect(
    screen.getByText(/not a universal ranking of those models/i),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "How these numbers are published" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Recent support on Ko-fi" }),
  ).not.toBeInTheDocument();
});

test("renders the official Ko-fi button in Tavernary orange", () => {
  render(<SupportPage />);

  const widget = screen.getByTitle("Support on Ko-fi");
  expect(widget.tagName).toBe("IFRAME");
  expect(widget).toHaveAttribute(
    "srcdoc",
    expect.stringContaining(
      "kofiwidget2.init('Support on Ko-fi', '#E18A24', 'I1F724I7NT')",
    ),
  );
  expect(widget).toHaveAttribute(
    "srcdoc",
    expect.stringContaining("color: #161008 !important"),
  );
  expect(
    screen.queryByRole("heading", { name: "Contribute through Ko-fi" }),
  ).not.toBeInTheDocument();
});
