# Tavernary Support and Sustainability Design

## Goal

Give visitors a clear way to support Tavernary and a candid account of what it
costs to operate. The feature combines a responsive Support link in the catalog
header, a dedicated `/support/` page styled like About with direct Ko-fi
fallback actions plus the compact official Ko-fi button widget, and a concise
sustainability section on `/about/`.

## Public support experience

The site-action order is `About`, `Help`, `Submit Project`, then Ko-fi. Above
760px the orange support link shows a coffee icon and `Support Tavernary`.
At 760px and below it becomes an orange square with only the icon visible while
retaining the accessible name `Support Tavernary on Ko-fi`.

The link matches the height of `Submit Project`, navigates to `/support/`, and
uses Tavernary's existing desktop tooltip treatment. The tooltip reads
`Support Tavernary on Ko-fi`; mobile retains the accessible name without
displaying a hover tooltip.

The Support page places Ko-fi's compact official button widget in the target
card and links directly to `https://ko-fi.com/mentallyquill` from its closing
action. The widget runs in a sandboxed `srcDoc` iframe because Ko-fi's supplied
script writes its button into the containing document. It initializes
`Widget_2.js` with page code `I1F724I7NT`, Tavernary orange `#E18A24`, and the
label `Support on Ko-fi`; local styles give the generated button Tavernary's
dark text, dark coffee icon, and hover treatment. The page does not embed a
full payment panel or separate recent-support section.

## Support page

`/support/` reuses the About page's narrow editorial layout and typography,
with small purpose-built cards for the monthly target and usage snapshot. The
target card uses comfortable inset padding, a neutral Tavernary card border,
and a narrow orange accent edge instead of a full orange outline. It contains:

1. A compact `$12/month` operating target and Ko-fi support action.
2. An explicit rollover policy: donations first cover the current month's
   operating costs; anything above that amount carries forward to future
   Tavernary operating costs.
3. A plain-language distinction between the deliberately simple `$12`
   community-funding goal and the `$13.50` uncached model-cost estimate.
   Tavernary's owner intends to cover costs above the goal for now. Measured
   costs may be lower with cached input and vary with actual usage.
4. A ranked explanation of the principal variable cost drivers: LLM-assisted
   security scanning, update reassessment and catalog churn, then new-project
   intake and enrichment. No unsupported percentage allocation is shown.
5. A usage snapshot labeled as estimated or measured, including reporting
   period, input tokens, cached input tokens when measured, output tokens,
   model requests, and actual API cost when available.
6. The current estimate: roughly 45 million tokens and 4,000 calls per month at
   about a 9:1 input-to-output ratio. At GPT-5.6 Luna's July 30, 2026 Standard
   rates of $0.20/M input and $1.20/M output, that is about $13.50 per month
   before caching or unusual service-tier adjustments.
7. A plain-language model choice explanation: GPT-5.6 Luna is used because its
   reliable strict structured output has required fewer repair retries in
   Tavernary's workloads. DeepSeek V4 and GLM-5.2 were tested extensively but
   required more retries and model/configuration changes. These are Tavernary's
   observed results, not universal model rankings.
8. A warm, concise appeal that connects support to keeping Tavernary
   independent, current, safer to explore, and open to everyone. Workflow and
   publication mechanics remain implementation details rather than a public
   report section.

The About page gains a `Sustainability and support` section summarizing the
$12 target, rollover policy, and link to `/support/`.

## Usage publication

Tavernary remains a static GitHub Pages site. A repository-owned JSON snapshot
is the only public data source. Its schema distinguishes `estimate` from
`measured` records so an estimate can never appear to be an invoice-derived
fact.

A Node script can query these official OpenAI organization endpoints:

- `/v1/organization/usage/completions` for token and request totals.
- `/v1/organization/costs` for invoice-reconcilable spend.

The script requires `OPENAI_ADMIN_KEY` and `OPENAI_PROJECT_ID`, retrieves one
completed UTC calendar month, follows pagination, aggregates only the selected
Tavernary project, and writes aggregate values. It fails closed when credentials,
project scope, response shape, currency, or pagination are invalid.

A monthly GitHub Action runs on the second day of the month and by manual
dispatch. The Admin key and Tavernary project ID live only in GitHub Actions
secrets. The workflow publishes the prior completed month, validates the site,
and commits only the aggregate snapshot. Until those secrets are configured,
the checked-in estimate remains visible and the workflow fails without exposing
data from the broader OpenAI organization.

## Ko-fi progress

Tavernary is hosted entirely on GitHub Pages and adds no external application
server. GitHub Pages cannot receive Ko-fi webhook POSTs, GitHub Actions cannot
act as a continuously available listener, and Ko-fi does not offer a supported
read API for a monthly payment ledger. Tavernary therefore does not claim an
automatic `this month's supporters` list or calculate funding from payments it
cannot retrieve.

Ko-fi remains the authority for contribution activity and goal progress.
Tavernary publishes only Ko-fi's compact official button widget, not a full
contribution or payment iframe, recent-support feed, donor list, or native
progress bar. Ko-fi does not provide a supported read API for GitHub Actions to
retrieve a current monthly total, so Tavernary describes the `$12/month`
operating target without presenting an unverifiable amount funded.

## Accessibility and responsive behavior

The header support link is keyboard accessible, exposes its destination through
normal link semantics, and uses the shared desktop tooltip component. Its
mobile icon-only state remains a 34px square without horizontal overflow at
390px or 320px.

The support page uses semantic headings and descriptions, readable compact
numbers, and never relies on color alone to communicate estimate/measured state.

## Testing

- Unit tests cover the usage aggregator, pagination, required project scope,
  malformed responses, and stable snapshot output.
- Component tests cover the Support and About content, header-link destination,
  tooltip semantics, official Ko-fi widget configuration, direct fallback URL,
  and absence of the removed full-contribution, developer-report, and
  recent-support sections.
- Workflow tests cover permissions, secret boundaries, schedule, scoped output,
  and validation before publication.
- Playwright tests cover static export, desktop/mobile header order and geometry,
  tooltip behavior, navigation, and support-page rendering.
- The full repository check, production build, static-export verification, and
  focused visual inspection are required before publication.

## Non-goals

- Receiving or storing Ko-fi webhooks, donor data, messages, or raw payments.
- Claiming a complete current-month supporter list, active membership, or
  payment-provider ledger parity.
- Publishing prompts, outputs, API keys, user/project identifiers, or daily
  organization-wide usage.
- Embedding or restyling Ko-fi's full cross-origin payment panel.
- Claiming exact cost allocation percentages without measured evidence.
