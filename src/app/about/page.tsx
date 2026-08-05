import Link from "next/link";

const securityUrl =
  "https://github.com/MentallyQuill/Tavernary/security/advisories/new";

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
          Tavernary is a search and discovery catalog for AI roleplay tools,
          surrounding the SillyTavern community. It indexes public project
          information and sends visitors to creator-owned repositories
          repository or source page.
        </p>

        <section>
          <h2>Why Tavernary exists</h2>
          <p>
            The tools people use to shape their roleplay experience are spread
            across Reddit posts, Discord channels, creator repositories, and
            word of mouth. The best discoveries can be difficult to find again,
            and a great project can be invisible outside the small corner where
            someone happened to share it.
          </p>
          <p>
            Tavernary is meant to give that scattered community a shared place
            to gather: somewhere to explore what exists, understand what each
            project does, and follow the path back to the people who made it.
          </p>
        </section>

        <section>
          <h2>Built for exploration</h2>
          <p>
            Search projects and creators, browse Frontends, Extensions, and
            System Presets, and use the catalog filters to narrow the field.
            Whether you are looking for a new interface, a small quality-of-life
            extension, or a preset to try, Tavernary is a place to start
            exploring.
          </p>
          <p>
            The idea takes inspiration from PCPartPicker.com and its Reddit
            roots: bring a fragmented community&apos;s knowledge into one place,
            then give people the tools to make something that fits them.
          </p>
        </section>

        <section>
          <h2>Make it yours with Kits</h2>
          <p>
            Kits are user-tailored collections of catalog projects. Browse
            community-made Kits for ideas, or assemble your own combination from
            the catalog instead of settling for one bundle chosen by Tavernary.
          </p>
          <p>
            Reorder the stack, save a draft in your browser, share your Kit with
            others, and submit it for review. Kits are a way for the community
            to show how its tools fit together—and for every visitor to find a
            setup that feels like their own.
          </p>
        </section>

        <section>
          <h2>Projects remain independent</h2>
          <p>
            Tavernary links outward to creator-owned repositories and source
            pages. It does not host, mirror, redistribute, or maintain project
            files. Creators remain responsible for their own releases,
            documentation, licenses, and support.
          </p>
          <p>
            If you have made something for the community, or know of a killer
            extension, prompt, or frontend that is not on Tavernary, you can add
            it to the catalog and help make the next discovery easier for
            someone else.
          </p>
        </section>

        <section id="frontend-eligibility">
          <h2>Adding Frontends</h2>
          <p>
            Frontends and Extensions require a public GitHub or Codeberg
            repository. The code must be visible without signing in, but an
            open-source license is not required. Tavernary does not require a
            popularity level or recent activity for inclusion.
          </p>
          <p>
            A submission should be an identifiable, usable Frontend rather than
            a library, theme, mockup, or placeholder, with enough public
            documentation to understand what it is and how to run it.
          </p>
          <p>
            Both providers receive the same repository activity, community, and
            attribution treatment in the catalog.
          </p>
        </section>

        <section id="safety-security">
          <h2>Safety and security</h2>
          <p>
            Tavernary is an independent directory of third-party projects.
            Listings are not endorsements, certifications, or guarantees of
            safety. Eligible GitHub listings may be scanned by{" "}
            <a href="https://mentallyquill.github.io/TavernKeeper/">
              TavernKeeper
            </a>
            {", "}an advisory security-scanning system, but scan results are not
            a guarantee that a project is safe or free of harmful behavior.
            Tavernary does not host, install, or execute listed projects, and
            cannot guarantee their code, dependencies, releases, installers, or
            behavior.
          </p>
          <p>
            Review a project&apos;s repository, permissions, dependencies,
            release history, and credential handling before installing or using
            it. Never provide API keys, passwords, or other secrets to software
            unless you understand how they are used.
          </p>
          <p>
            Scan colors describe the evidence at one exact commit. Teal means
            low concern, orange means a material concern, and red means
            immediate danger at the exact scanned commit. A critical dependency
            advisory alone does not make a project red. Red results identify
            whether the danger is credible malicious or compromised behavior, a
            critical readily exploitable vulnerability, or both. Red projects
            remain listed so the community can see the warning; scan results do
            not automatically hide or delist a project.
          </p>
        </section>

        <section id="reporting-removal">
          <h2>Reporting and removal</h2>
          <p>
            A verified personal GitHub owner can use{" "}
            <Link href="/help/manage-project/">
              Manage your project listing
            </Link>{" "}
            to request a card edit, a move of the same repository, or a delist.
            Reviewed Tavernary owners, admins, and maintainers may use that
            reviewed request for any card. Other organization maintainers and
            rights holders use a human-reviewed public report through{" "}
            <Link href="/help/report-project/">Report a project listing</Link>.
          </p>
          <p>
            Users can report inaccurate, outdated, unsafe, malicious, or abusive
            listings. This includes suspected malware or credential theft,
            hateful or discriminatory content, exploitative or non-consensual
            sexual content, sexual content involving minors, threats, or other
            clearly harmful material. Include the project URL, specific concern,
            and useful evidence. Do not include API keys, passwords, or other
            private information.
          </p>
          <p>
            Security vulnerabilities should be reported through the
            repository&apos;s
            <a href={securityUrl}> private security path</a>. Tavernary may
            correct, hide, pause, or remove a listing while a report is
            reviewed.
          </p>
        </section>

        <section id="legal-information">
          <h2>Legal information</h2>
          <p>
            Tavernary links to creator-owned repositories and source pages. It
            does not redistribute third-party project files or guarantee their
            legality, safety, accuracy, availability, or suitability. Users are
            responsible for evaluating third-party projects before using them.
          </p>
          <p>
            Project names, trademarks, content, and files remain the property of
            their respective owners. Tavernary may update or remove catalog
            entries when information changes, a rights holder requests a
            correction, or a listing is reported as unsafe or abusive.
          </p>
        </section>

        <div className="about-actions">
          <Link className="primary-action" href="/submit/project/">
            Submit a project
          </Link>
          <Link href="/help/">Get help</Link>
        </div>
      </article>
    </main>
  );
}
