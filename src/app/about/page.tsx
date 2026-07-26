import Link from "next/link";

const helpUrl = "https://github.com/MentallyQuill/Tavernary/issues/new/choose";

export const metadata = {
  title: "About Tavernary",
  description: "How Tavernary indexes and presents AI roleplay projects.",
};

export default function AboutPage() {
  return (
    <main className="about-page">
      <nav className="about-nav" aria-label="About navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>

      <article className="about-content">
        <p className="about-kicker">About</p>
        <h1>About Tavernary</h1>
        <p className="about-lead">
          Tavernary is a search and discovery catalog for AI roleplay tools. It
          indexes public project information and sends visitors to each
          creator&apos;s own GitHub repository or source page. Tavernary does
          not host, mirror, redistribute, or install project files.
        </p>

        <section>
          <h2>What belongs in the catalog</h2>
          <p>
            Frontends and Extensions must have a public GitHub repository so
            Tavernary can verify their identity and refresh factual project
            information automatically. System Presets may instead link to the
            public page where their creator publishes them.
          </p>
          <p>
            Every submission is reviewed before it appears. A non-GitHub System
            Preset is locked after acceptance because Tavernary cannot verify
            that a later editor is the original creator. Maintainers may still
            correct, hide, or remove an entry when necessary.
          </p>
        </section>

        <section>
          <h2>What Tavernary records</h2>
          <p>
            Maintainers manage the project name, factual summary,
            classification, supported frontends, capabilities, and canonical
            source. GitHub supplies repository facts such as the latest
            meaningful commit, release date, community counts, repository size,
            and root license.
          </p>
          <p>
            Recent Activity sorts by the latest meaningful commit. Activity
            Strength is the number of weeks with meaningful commits during the
            last 12 weeks. Projects with no meaningful commit for more than 12
            weeks may remain visible but are marked dormant. Automated updates
            can be paused, and entries can be hidden or removed during
            moderation.
          </p>
        </section>

        <section>
          <h2>Independent projects</h2>
          <p>
            Inclusion is not an endorsement, certification, or guarantee.
            Project creators control their own files, releases, documentation,
            licenses, and support. Review a project&apos;s source page before
            installing or using it.
          </p>
        </section>

        <div className="about-actions">
          <Link className="primary-action" href="/submit/project/">
            Submit a project
          </Link>
          <a href={helpUrl}>Get help</a>
        </div>
      </article>
    </main>
  );
}
