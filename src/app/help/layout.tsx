import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Menu | Tavernary",
  robots: { index: false, follow: true },
};

export default function LegacyHelpLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
