import type { Page } from "@playwright/test";
import type { RevisionManifest } from "./revision-manifest.mjs";
import type { Catalog } from "../../src/features/catalog/catalog-types.ts";
export function verifyEssentialBrowser(input: {
  page: Page;
  origin: string;
  expected: RevisionManifest;
  catalog: Catalog;
  timeoutMs?: number;
}): Promise<void>;
export function runEssentialBrowserSmoke(input: {
  signal?: AbortSignal;
  origin: string;
  expected: RevisionManifest;
  catalog: Catalog;
}): Promise<boolean>;
