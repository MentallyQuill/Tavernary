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
      "The $12 target is a simple community-funding goal. I'll cover anything beyond that for now as I explore community interest in supporting Tavernary and making it sustainable.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      /The \$13\.50 model figure below is an uncached estimate/i,
    ),
  ).not.toBeInTheDocument();
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
  expect(screen.getByText("160M", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("4,000", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("9:1", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("$48.00", { exact: true })).toBeInTheDocument();
  expect(screen.getByText(/144 million input tokens/i)).toBeInTheDocument();
  expect(screen.getByText(/16 million output tokens/i)).toBeInTheDocument();
  expect(
    screen.getByText(/June 30, 2026 reduced pricing/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/uncached Luna-equivalent/i)).toBeInTheDocument();
});

test("describes Scan v4's model roles and token-saving safeguards", () => {
  render(<SupportPage />);

  expect(screen.getByText(/strict structured output/i)).toBeInTheDocument();
  expect(
    screen.getByText(/DeepSeek V4 Flash.*first pass/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/shared repository context.*once/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/only invalid or missing reviews/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/meaningful review inputs are identical/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/changed or higher-risk evidence/i),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "How these numbers are published" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Recent support on Ko-fi" }),
  ).not.toBeInTheDocument();
});

test("renders a direct Ko-fi link in the monthly target", () => {
  render(<SupportPage />);

  const monthlyTarget = screen.getByRole("region", {
    name: "Monthly operating target",
  });
  const supportLink = within(monthlyTarget).getByRole("link", {
    name: "Support on Ko-fi",
  });

  expect(supportLink).toHaveAttribute(
    "href",
    "https://ko-fi.com/mentallyquill",
  );
  expect(supportLink).toHaveAttribute("target", "_blank");
  expect(supportLink).toHaveAttribute("rel", "noreferrer noopener");
});
