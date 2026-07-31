import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { useCatalogQuery } from "@/features/catalog/use-catalog-query";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("catalog query history", () => {
  test.each([
    ["/?q=preset+freaky", "relevance"],
    ["/?q=preset+freaky&sort=popularity", "popularity"],
    ["/?sort=relevance", "recent"],
    ["/?q=---", "recent"],
  ] as const)("derives the effective sort from %s", (url, sort) => {
    window.history.replaceState(null, "", url);

    const { result } = renderHook(() => useCatalogQuery());

    expect(result.current.query.sort).toBe(sort);
  });

  test("treats a stale Uncategorized URL as the default category", () => {
    window.history.replaceState(null, "", "/?category=uncategorized");

    const { result } = renderHook(() => useCatalogQuery());

    expect(result.current.query.category).toBe("");
  });

  test("pushes relationship scope with an origin marker", () => {
    window.history.replaceState(null, "", "/?q=memory&kind=extension");
    const pushState = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useCatalogQuery());

    act(() => {
      result.current.pushQuery((current) => ({
        ...current,
        relationship: "child",
      }));
    });

    expect(pushState).toHaveBeenCalledWith(
      { tavernaryRelationshipOrigin: true },
      "",
      "/?q=memory&relationship=child&kind=extension",
    );
    expect(result.current.query.relationship).toBe("child");
  });

  test("returns through history for a locally pushed relationship", () => {
    window.history.replaceState(null, "", "/?q=memory");
    const { result } = renderHook(() => useCatalogQuery());
    act(() => {
      result.current.pushQuery({
        ...DEFAULT_QUERY,
        search: "memory",
        relationship: "child",
      });
    });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

    act(() => {
      result.current.removeRelationship();
    });

    expect(back).toHaveBeenCalledOnce();
  });

  test("removes only relationship from a directly loaded URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?q=memory&relationship=child&kind=extension",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useCatalogQuery());

    act(() => {
      result.current.removeRelationship();
    });

    expect(back).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/?q=memory&kind=extension",
    );
    expect(result.current.query).toEqual({
      ...DEFAULT_QUERY,
      search: "memory",
      sort: "relevance",
      kits: {
        ...DEFAULT_QUERY.kits,
        sort: "relevance",
      },
      kinds: ["extension"],
    });
  });

  test("clear all replaces relationship scope with the default query", () => {
    window.history.replaceState(
      { tavernaryRelationshipOrigin: true },
      "",
      "/?q=memory&relationship=child",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useCatalogQuery());

    act(() => {
      result.current.setQuery(DEFAULT_QUERY);
    });

    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/");
    expect(result.current.query).toEqual(DEFAULT_QUERY);
  });
});
