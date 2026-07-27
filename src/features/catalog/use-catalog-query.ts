"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  parseCatalogQuery,
  serializeCatalogQuery,
  type CatalogQuery,
} from "./catalog-query";

const queryChangeEvent = "tavernary-querychange";

type TavernaryHistoryState = {
  tavernaryRelationshipOrigin?: boolean;
};

export interface CatalogQueryHistory {
  setQuery(
    next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery),
  ): void;
  pushQuery(
    next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery),
  ): void;
  removeRelationship(): void;
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(queryChangeEvent, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(queryChangeEvent, listener);
  };
}

function currentSearch() {
  return window.location.search;
}

function serverSearch() {
  return "";
}

export function useCatalogQuery() {
  const search = useSyncExternalStore(subscribe, currentSearch, serverSearch);
  const query = useMemo(() => parseCatalogQuery(search), [search]);

  const updateQuery = useCallback(
    (
      method: "pushState" | "replaceState",
      next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery),
    ) => {
      const current = parseCatalogQuery(window.location.search);
      const resolved = typeof next === "function" ? next(current) : next;
      const nextSearch = serializeCatalogQuery(resolved);
      const url = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      const state: TavernaryHistoryState | null =
        method === "pushState" ? { tavernaryRelationshipOrigin: true } : null;
      window.history[method](state, "", url);
      window.dispatchEvent(new Event(queryChangeEvent));
    },
    [],
  );

  const setQuery = useCallback<CatalogQueryHistory["setQuery"]>(
    (next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery)) => {
      updateQuery("replaceState", next);
    },
    [updateQuery],
  );

  const pushQuery = useCallback<CatalogQueryHistory["pushQuery"]>(
    (next) => {
      updateQuery("pushState", next);
    },
    [updateQuery],
  );

  const removeRelationship = useCallback(() => {
    const current = parseCatalogQuery(window.location.search);
    if (!current.relationship) {
      return;
    }
    const state = window.history.state as TavernaryHistoryState | null;
    if (state?.tavernaryRelationshipOrigin) {
      window.history.back();
      return;
    }
    updateQuery("replaceState", { ...current, relationship: "" });
  }, [updateQuery]);

  return { query, setQuery, pushQuery, removeRelationship };
}
