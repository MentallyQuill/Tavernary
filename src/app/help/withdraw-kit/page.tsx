import { Suspense } from "react";

import {
  KitWithdrawalForm,
  type KitWithdrawalOption,
} from "@/features/help/components/kit-withdrawal-form";
import { HelpPageShell } from "@/features/help/components/help-page-shell";
import { loadCatalog } from "@/lib/catalog/load-catalog";

interface CatalogKitForWithdrawalOption {
  id: unknown;
  title: unknown;
  author: { login: unknown } | null;
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
    ? value.trim()
    : null;
}

export function mapKitWithdrawalOptions(
  kits: readonly CatalogKitForWithdrawalOption[],
): KitWithdrawalOption[] {
  const seenKitIds = new Set<string>();
  return kits.flatMap((kit) => {
    const id = text(kit.id, 120);
    const title = text(kit.title);
    const author = text(kit.author?.login, 120);
    if (!id || !title || !author || seenKitIds.has(id)) return [];
    seenKitIds.add(id);
    return [
      {
        id,
        title,
        author,
        shareUrl: `https://tavernary.org/?mode=kits&kit=${encodeURIComponent(id)}`,
      },
    ];
  });
}

export const metadata = {
  title: "Withdraw a Kit | Tavernary",
  description: "Request withdrawal of a Tavernary Kit you authored.",
};

export default function KitWithdrawalPage() {
  const catalog = loadCatalog();
  return (
    <HelpPageShell
      kicker="Help"
      title="Withdraw a Kit"
      lead="Request removal of a Kit you authored from Tavernary's public catalog."
    >
      <Suspense fallback={<p>Loading Kit withdrawal form…</p>}>
        <KitWithdrawalForm kits={mapKitWithdrawalOptions(catalog.kits)} />
      </Suspense>
    </HelpPageShell>
  );
}
