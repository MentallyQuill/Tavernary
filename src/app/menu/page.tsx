import Link from "next/link";

import { MenuPageShell } from "@/features/menu/components/menu-page-shell";

const menuGroups = [
  {
    title: "Manage and publish",
    items: [
      {
        href: "/menu/manage-project/",
        title: "Update or rename your project listing",
        description:
          "Change its display name, card details, repository location, or listing status.",
      },
      {
        href: "/submit/project/",
        title: "Submit a project",
        description: "Add a project that is not yet listed in Tavernary.",
      },
      {
        href: "/?mode=kits",
        title: "Build or manage Kits",
        description: "Create, inspect, duplicate, or edit a collection of projects.",
      },
      {
        href: "/menu/withdraw-kit/",
        title: "Withdraw a published Kit",
        description: "Request removal of a Kit you published.",
      },
    ],
  },
  {
    title: "Browse and learn",
    items: [
      {
        href: "/",
        title: "Browse projects",
        description: "Search and filter the complete Tavernary catalog.",
      },
      {
        href: "/?mode=kits",
        title: "Browse Kits",
        description: "Explore project collections assembled by the community.",
      },
      {
        href: "/about/",
        title: "About Tavernary",
        description: "Learn what Tavernary does and where its boundaries are.",
      },
      {
        href: "/catalog-policy/",
        title: "Catalog Policy",
        description: "Read the rules applied to projects and public listings.",
      },
    ],
  },
  {
    title: "Reports and help",
    items: [
      {
        href: "/menu/report-project/",
        title: "Report a project listing",
        description: "Flag incorrect, unsafe, duplicate, or rights-related information.",
      },
      {
        href: "/menu/report-kit/",
        title: "Report a Kit",
        description: "Report a compatibility, safety, accuracy, or attribution concern.",
      },
      {
        href: "/menu/report-website/",
        title: "Report a website problem",
        description: "Tell us about a broken page, control, form, or interaction.",
      },
      {
        href: "/menu/other/",
        title: "Ask a Tavernary question",
        description: "Ask for help or suggest an improvement not covered elsewhere.",
      },
      {
        href: "/menu/security/",
        title: "Report a security issue privately",
        description: "Use GitHub's private reporting flow for a Tavernary vulnerability.",
      },
    ],
  },
] as const;

export const metadata = {
  title: "Menu | Tavernary",
  description: "Browse Tavernary or choose a project, Kit, or reporting action.",
};

export default function MenuPage() {
  return (
    <MenuPageShell
      kicker="Tavernary"
      title="Menu"
      lead={
        <p>Browse Tavernary, manage your projects and Kits, or report a problem.</p>
      }
      backHref="/"
      backLabel="← Back to the catalog"
    >
      <div className="menu-groups">
        {menuGroups.map((group) => (
          <section className="menu-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="menu-items">
              {group.items.map((item) => (
                <Link className="menu-item" href={item.href} key={item.href}>
                  <span className="menu-item-title">{item.title}</span>
                  <span className="menu-item-description">
                    {item.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MenuPageShell>
  );
}
