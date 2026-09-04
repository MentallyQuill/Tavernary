import type { Metadata } from "next";

import { LegacyMenuRedirect } from "@/features/menu/components/legacy-menu-redirect";

export const metadata: Metadata = {
  title: "Menu | Tavernary",
  robots: { index: false, follow: true },
};

export default function LegacyHelpLayout() {
  return <LegacyMenuRedirect />;
}
