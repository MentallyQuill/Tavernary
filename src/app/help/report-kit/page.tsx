import { Suspense } from "react";

import { HelpPageShell } from "@/features/help/components/help-page-shell";
import {
  KitReportForm,
  type HelpKitOption,
} from "@/features/help/components/kit-report-form";
import { loadCatalog } from "@/lib/catalog/load-catalog";

interface CatalogKitForHelpOption {
  id: unknown;
  title: unknown;
  author: { login: unknown } | null;
  publishedAt: unknown;
  components: Array<{ projectId: unknown; name: unknown }>;
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
    ? value.trim()
    : null;
}

export function mapHelpKitOptions(
  kits: readonly CatalogKitForHelpOption[],
): HelpKitOption[] {
  const seenKitIds = new Set<string>();
  return kits.flatMap((kit) => {
    const id = text(kit.id, 120);
    const title = text(kit.title);
    const author = text(kit.author?.login, 120);
    const publishedAt = text(kit.publishedAt, 120);
    if (!id || !title || !author || !publishedAt || seenKitIds.has(id))
      return [];
    seenKitIds.add(id);

    const seenProjectIds = new Set<string>();
    const projects = kit.components.flatMap((project) => {
      const projectId = text(project.projectId, 120);
      const name = text(project.name);
      if (!projectId || !name || seenProjectIds.has(projectId)) return [];
      seenProjectIds.add(projectId);
      return [{ id: projectId, name }];
    });

    return [
      {
        id,
        title,
        author,
        shareUrl: `https://tavernary.org/?mode=kits&kit=${encodeURIComponent(id)}`,
        publishedAt,
        projects,
      },
    ];
  });
}

export const metadata = {
  title: "Report a Kit | Tavernary",
  description: "Report a concern about a published Tavernary Kit.",
};

export default function KitReportPage() {
  const catalog = loadCatalog();
  const siteRevision =
    process.env.GITHUB_SHA?.slice(0, 120) ?? catalog.generatedAt;

  return (
    <HelpPageShell
      kicker="Help"
      title="Report a Kit"
      lead="Use this form to report a compatibility, safety, accuracy, broken-project, or duplicate-Kit concern about a published Kit."
    >
      <Suspense fallback={<p>Loading Kit report form…</p>}>
        <KitReportForm
          kits={mapHelpKitOptions(catalog.kits)}
          siteRevision={siteRevision}
        />
      </Suspense>
    </HelpPageShell>
  );
}
