import Link from "next/link";

import { HelpPageShell } from "@/features/help/components/help-page-shell";

const helpPaths = [
  {
    href: "/help/manage-project/",
    title: "Manage your project listing",
    description:
      "Repository owners can correct card details, update the listed repository location, or request delisting.",
  },
  {
    href: "/help/report-project/",
    title: "Report a project listing",
    description:
      "Report inaccurate, outdated, unsafe, abusive, duplicate, or rights-related catalog information.",
  },
  {
    href: "/help/report-website/",
    title: "Report a website problem",
    description:
      "Report a problem with Tavernary's pages, search, filters, links, forms, accessibility, or behavior.",
  },
  {
    href: "/help/report-kit/",
    title: "Report a Kit",
    description:
      "Report a compatibility, safety, accuracy, broken-project, or duplicate-Kit concern.",
  },
  {
    href: "/help/other/",
    title: "Get other help",
    description:
      "Ask a Tavernary question, report a stuck request, or suggest an improvement not covered above.",
  },
];

export const metadata = {
  title: "Help | Tavernary",
  description: "Find the right way to get help with Tavernary.",
};

export default function HelpPage() {
  return (
    <HelpPageShell
      kicker="Help"
      title="Help"
      lead={
        <p>
          Choose the closest match. Tavernary will help you prepare the right
          request and let you review it on GitHub before anything is sent.
        </p>
      }
    >
      <section className="help-paths" aria-label="Help topics">
        {helpPaths.map((path) => (
          <section className="help-path" key={path.href}>
            <Link href={path.href}>
              <h2>{path.title}</h2>
            </Link>
            <p>{path.description}</p>
          </section>
        ))}
      </section>

      <section
        className="help-security-callout"
        aria-labelledby="security-help-heading"
      >
        <h2 id="security-help-heading">
          Security vulnerability? Report it privately.
        </h2>
        <p>
          Do not disclose credentials, exploit details, or a Tavernary
          vulnerability in a public issue.
        </p>
        <Link href="/help/security/">Open private security reporting</Link>
      </section>

      <aside className="help-quiet-links" aria-label="Additional help">
        <Link href="/submit/project/">Submit a new project</Link>
        <a href="https://github.com/MentallyQuill/Tavernary/blob/main/docs/guides/what-is-tavernary.md">
          Learn how the catalog works
        </a>
        <p>
          Need support for a listed project? Contact that project&apos;s own
          repository or support channel.
        </p>
      </aside>
    </HelpPageShell>
  );
}
