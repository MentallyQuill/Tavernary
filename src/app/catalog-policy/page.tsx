import Link from "next/link";

import { CATALOG_POLICY_VERSION } from "@/features/catalog/catalog-policy.mjs";

export const metadata = {
  title: "Catalog Policy | Tavernary",
  description:
    "How Tavernary describes, reviews, and responds to listed project content.",
};

export default function CatalogPolicyPage() {
  return (
    <main className="about-page">
      <nav className="about-nav" aria-label="Catalog Policy navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>

      <article className="about-content">
        <p className="about-kicker">Policy</p>
        <h1>Catalog Policy</h1>
        <p className="about-lead">
          Tavernary is an index of independent projects. A listing is not an
          endorsement, certification, or safety review.
        </p>

        <section>
          <h2>Public catalog descriptions</h2>
          <p>
            Catalog descriptions should explain a project in language suitable
            for a public project directory. Consensual adult sexual content,
            kink, fetish-oriented roleplay, and ordinary profanity are
            permitted. Tavernary may neutralize graphic wording without
            concealing that a project supports adult subject matter.
          </p>
          <p>
            Promotion of hatred or discrimination is prohibited. Sexual
            exploitation or sexual content involving minors is prohibited. Other
            material that presents a concrete catalog-policy conflict may be
            reviewed by Tavernary staff.
          </p>
        </section>

        <section>
          <h2>How descriptions are prepared</h2>
          <p>
            When a verified project owner or authorized Tavernary staff member
            supplies a summary, Tavernary preserves their exact wording and
            structure whenever possible. Only the smallest necessary
            catalog-policy, emoji, punctuation, or high-confidence spelling
            correction is made.
          </p>
          <p>
            For other submissions, Tavernary grounds its summary in repository
            README evidence first, the repository description second, and the
            submitted description third.
          </p>
        </section>

        <section>
          <h2>Review and reporting</h2>
          <p>
            Automated review signals are advisory, not determinations that a
            project violated this policy. They do not stop an otherwise valid
            listing from being published. Community reports are Tavernary’s
            primary path for enforcement review.
          </p>
          <p>
            A verified owner may permanently delist their project through the
            project-management workflow. Anyone can{" "}
            <Link href="/help/report-project/">report a project listing</Link>{" "}
            that may need staff review.
          </p>
        </section>

        <p>Policy version: {CATALOG_POLICY_VERSION}</p>
      </article>
    </main>
  );
}
