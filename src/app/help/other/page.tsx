import { HelpPageShell } from "@/features/help/components/help-page-shell";
import { OtherHelpForm } from "@/features/help/components/other-help-form";

export const metadata = {
  title: "Other Help | Tavernary",
  description:
    "Ask a Tavernary question about something not covered elsewhere.",
};

export default function OtherHelpPage() {
  const siteRevision =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  return (
    <HelpPageShell
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
    </HelpPageShell>
  );
}
