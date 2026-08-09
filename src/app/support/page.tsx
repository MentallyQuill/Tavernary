import Link from "next/link";

import { getLatestSupportUsage } from "@/features/support/support-data";

const kofiProfileUrl = "https://ko-fi.com/mentallyquill";

export const metadata = {
  title: "Support Tavernary",
  description:
    "See what Tavernary costs to operate, how support is used, and how to help.",
};

function compactTokens(value: number) {
  const millions = value / 1_000_000;
  return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function SupportPage() {
  const usage = getLatestSupportUsage();
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const inputOutputRatio = Math.round(usage.inputTokens / usage.outputTokens);

  return (
    <main className="about-page support-page">
      <nav className="about-nav" aria-label="Support navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>

      <article className="about-content support-content">
        <p className="about-kicker">Sustainability</p>
        <h1>Support Tavernary</h1>
        <p className="about-lead">
          Tavernary is free to browse and independent of the projects it
          catalogs. Community support helps cover the automated work needed to
          keep a growing catalog current, useful, and safer to explore.
        </p>

        <section className="support-target" aria-labelledby="monthly-target">
          <div>
            <p className="support-eyebrow">Community-funded upkeep</p>
            <div className="support-target-heading">
              <h2 id="monthly-target">Monthly operating target</h2>
              <strong className="support-target-value">$12/month</strong>
            </div>
            <a
              className="support-kofi-link"
              href={kofiProfileUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <svg
                className="support-kofi-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h13v6.5A4.5 4.5 0 0 1 12.5 19h-4A4.5 4.5 0 0 1 4 14.5V8Z" />
                <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 5.5c0-1 1-1 1-2M12 5.5c0-1 1-1 1-2" />
              </svg>
              <span>Support on Ko-fi</span>
            </a>
            <p>
              Donations first cover Tavernary&apos;s operating costs for the
              current month. Anything above the current month&apos;s costs
              carries forward to help cover future Tavernary operating costs.
            </p>
            <p>
              The $12 target is a simple community-funding goal.
              Tavernary&apos;s owner intends to cover costs above it for now.
              The $13.50 model figure below is an uncached estimate; measured
              costs may be lower with cached input and will vary with usage.
            </p>
          </div>
        </section>

        <section>
          <h2>Where the money goes</h2>
          <p>
            The largest variable expense is model use. These are the principal
            cost drivers, in descending order based on Tavernary&apos;s current
            workload. They are ranked rather than assigned invented percentages.
          </p>
          <ol
            className="support-driver-list"
            aria-label="Operating cost drivers"
          >
            <li>
              <strong>LLM-assisted security scanning.</strong> Reviewing
              eligible source repositories and producing bounded public
              assessments is the largest part of monthly model use.
            </li>
            <li>
              <strong>Update reassessment and catalog churn.</strong> Repository
              changes can trigger new evidence collection, review, and summary
              work so listings do not quietly become stale.
            </li>
            <li>
              <strong>New-project intake and enrichment.</strong> New
              submissions need structured classification and catalog copy before
              human review and publication.
            </li>
          </ol>
        </section>

        <section aria-labelledby="usage-heading">
          <div className="support-section-heading">
            <h2 id="usage-heading">Monthly model usage</h2>
            <span className="support-data-kind">
              {usage.kind === "measured" ? "Measured" : "Estimated"}
            </span>
          </div>
          <p>
            {usage.kind === "measured"
              ? `${monthLabel(usage.periodStart)} organization usage for the scoped Tavernary OpenAI project.`
              : `A representative monthly estimate recorded in ${monthLabel(usage.generatedAt)} while automated reporting is being established.`}
          </p>
          <dl className="support-metrics">
            <div>
              <dt>Total tokens</dt>
              <dd>{compactTokens(totalTokens)}</dd>
            </div>
            <div>
              <dt>Model calls</dt>
              <dd>{usage.requests.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Input : output</dt>
              <dd>{inputOutputRatio}:1</dd>
            </div>
            <div>
              <dt>Model cost</dt>
              <dd>${usage.costUsd.toFixed(2)}</dd>
            </div>
          </dl>
          <p>
            The estimate uses 40.5 million input tokens and 4.5 million output
            tokens at GPT-5.6 Luna&apos;s July 30, 2026 pricing of $0.20 and
            $1.20 per million tokens respectively. Measured costs may be lower
            with cached input or differ with service tier and workload shape.
          </p>
        </section>

        <section>
          <h2>Why GPT-5.6 Luna</h2>
          <p>
            Tavernary&apos;s automation depends on strict structured output.
            Testing found that GPT-5.6 Luna produced valid JSON more
            consistently, which meant fewer repair retries and faster processing
            as the community grew.
          </p>
          <p>
            DeepSeek V4 and GLM-5.2 were tested extensively, but
            Tavernary&apos;s workflows required more retries and more model or
            configuration changes to stay reliable. That is an observation from
            Tavernary&apos;s workload, not a universal ranking of those models.
          </p>
        </section>

        <div className="about-actions">
          <a
            className="primary-action"
            href={kofiProfileUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Support Tavernary
          </a>
          <Link href="/about/">About Tavernary</Link>
        </div>
      </article>
    </main>
  );
}
