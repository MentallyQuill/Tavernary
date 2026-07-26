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
          Tavernary is a search and discovery catalog for AI roleplay tools,
          surrounding the SillyTavern community. It indexes public project
          information and sends visitors to each creator&apos;s own GitHub
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
