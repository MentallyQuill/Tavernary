import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { SearchEvidence } from "@/features/search/components/search-evidence";
import {
  SearchCorrection,
  SearchEmptyState,
} from "@/features/search/components/search-empty-state";
import { useSearchAnnouncement } from "@/features/search/use-search-announcement";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("hides evidence already obvious in title or summary", () => {
  const { rerender } = render(
    <SearchEvidence
      evidence={[
        {
          field: "title",
          value: "Freaky",
          kind: "exact",
          queryTerm: "freaky",
          matchedTerm: "freaky",
        },
      ]}
    />,
  );
  expect(screen.queryByText(/Matched/u)).not.toBeInTheDocument();

  rerender(
    <SearchEvidence
      evidence={[
        {
          field: "maintainers",
          value: "MentallyQuill",
          kind: "exact",
          queryTerm: "mentallyquill",
          matchedTerm: "mentallyquill",
        },
      ]}
    />,
  );
  expect(screen.getByText("Matched maintainer:")).toBeVisible();
  expect(screen.getByText("MentallyQuill")).toBeVisible();
});

test("explains matches hidden by filters and exposes the parent action", async () => {
  const user = userEvent.setup();
  const onClearFilters = vi.fn();
  render(
    <SearchEmptyState
      mode="projects"
      query="preset freaky"
      textMatchCount={2}
      activeFilterCount={1}
      correction={null}
      onUseCorrection={vi.fn()}
      onClearFilters={onClearFilters}
    />,
  );
  expect(
    screen.getByText("2 search matches are hidden by filters"),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(onClearFilters).toHaveBeenCalledOnce();
});

test("offers but does not apply a spelling correction", async () => {
  const user = userEvent.setup();
  const onUseCorrection = vi.fn();
  render(
    <SearchCorrection
      correction="frankenstein"
      onUseCorrection={onUseCorrection}
    />,
  );
  const action = screen.getByRole("button", {
    name: "Search for frankenstein",
  });
  expect(action).toBeVisible();
  expect(onUseCorrection).not.toHaveBeenCalled();
  await user.click(action);
  expect(onUseCorrection).toHaveBeenCalledWith("frankenstein");
});

test("distinguishes all-term misses from ordinary empty catalog states", () => {
  const { rerender } = render(
    <SearchEmptyState
      mode="kits"
      query="terms that miss"
      textMatchCount={0}
      activeFilterCount={0}
      correction={null}
      onUseCorrection={vi.fn()}
    />,
  );
  expect(screen.getByText("No Kit matches all search terms")).toBeVisible();
  expect(screen.getByText("Try removing a term.")).toBeVisible();

  rerender(
    <SearchEmptyState
      mode="kits"
      query="missing clause+other missing"
      textMatchCount={0}
      activeFilterCount={0}
      correction="missing clauses+other missing"
      onUseCorrection={vi.fn()}
    />,
  );
  expect(screen.getByText("No Kit matches any search clause")).toBeVisible();
  expect(
    screen.getByText(
      "All words within each clause are required. Check the suggested spelling.",
    ),
  ).toBeVisible();

  rerender(
    <SearchEmptyState
      mode="kits"
      query=""
      textMatchCount={0}
      activeFilterCount={0}
      correction={null}
      onUseCorrection={vi.fn()}
    />,
  );
  expect(screen.getByText("No Kits have been published yet")).toBeVisible();
});

test("delays and collapses rapid live-region announcements", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ count }) => ({
      visibleCount: count,
      announcement: useSearchAnnouncement(`${count} projects shown`),
    }),
    { initialProps: { count: 3 } },
  );

  expect(result.current).toEqual({
    visibleCount: 3,
    announcement: "3 projects shown",
  });
  rerender({ count: 2 });
  expect(result.current).toEqual({
    visibleCount: 2,
    announcement: "3 projects shown",
  });
  rerender({ count: 1 });
  act(() => vi.advanceTimersByTime(249));
  expect(result.current.announcement).toBe("3 projects shown");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toEqual({
    visibleCount: 1,
    announcement: "1 projects shown",
  });
});
