import { OtherHelpForm } from "@/features/help/components/other-help-form";
import { MenuPageShell } from "@/features/menu/components/menu-page-shell";

export const metadata = {
  title: "Other Help | Tavernary",
  description:
    "Ask a Tavernary question about something not covered elsewhere.",
};

export default function OtherMenuPage() {
  const siteRevision =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  return (
    <MenuPageShell
      kicker="Help"
      title="Get other help"
      lead={
        <p>
          Use this path after checking the more specific options below. You can
          review the public GitHub request before anything is opened.
        </p>
      }
    >
      <OtherHelpForm siteRevision={siteRevision} />
    </MenuPageShell>
  );
}
