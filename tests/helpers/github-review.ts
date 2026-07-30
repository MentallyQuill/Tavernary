import type { Page } from "@playwright/test";

interface GitHubReviewRecorderOptions {
  blocked?: boolean;
}

export async function installGitHubReviewRecorder(
  page: Page,
  { blocked = false }: GitHubReviewRecorderOptions = {},
) {
  await page.addInitScript(
    ({ initiallyBlocked }) => {
      const recorder = window as Window & {
        __openedGitHubReviews?: string[];
        __blockGitHubReviews?: boolean;
        __copiedGitHubManifest?: string;
      };
      Object.defineProperty(recorder, "__openedGitHubReviews", {
        configurable: true,
        value: [],
      });
      Object.defineProperty(recorder, "__blockGitHubReviews", {
        configurable: true,
        writable: true,
        value: initiallyBlocked,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            recorder.__copiedGitHubManifest = value;
          },
        },
      });
      Object.defineProperty(window, "open", {
        configurable: true,
        value: (url?: string | URL) => {
          recorder.__openedGitHubReviews?.push(String(url ?? ""));
          return recorder.__blockGitHubReviews ? null : window;
        },
      });
    },
    { initiallyBlocked: blocked },
  );
}

export async function openedGitHubReviews(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __openedGitHubReviews?: string[];
        }
      ).__openedGitHubReviews ?? [],
  );
}

export async function setGitHubReviewsBlocked(page: Page, blocked: boolean) {
  await page.evaluate((nextBlocked) => {
    (
      window as Window & {
        __blockGitHubReviews?: boolean;
      }
    ).__blockGitHubReviews = nextBlocked;
  }, blocked);
}

export async function copiedGitHubManifest(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __copiedGitHubManifest?: string;
        }
      ).__copiedGitHubManifest ?? null,
  );
}
