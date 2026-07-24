"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  parseCatalogQuery,
  serializeCatalogQuery,
  type CatalogQuery,
} from "./catalog-query";

const queryChangeEvent = "tavernary-querychange";

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

  const setQuery = useCallback(
    (next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery)) => {
      const current = parseCatalogQuery(window.location.search);
      const resolved = typeof next === "function" ? next(current) : next;
      const nextSearch = serializeCatalogQuery(resolved);
      const url = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new Event(queryChangeEvent));
    },
    [],
  );

  return { query, setQuery };
}
