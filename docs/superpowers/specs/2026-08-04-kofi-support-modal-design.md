# Tavernary Support and Sustainability Design

## Goal

Give visitors a clear way to support Tavernary and a candid account of what it
costs to operate. The feature combines a responsive Ko-fi action in the catalog
header, an accessible Tavernary-owned Ko-fi dialog, a dedicated `/support/`
page styled like About, and a concise sustainability section on `/about/`.

## Public support experience

The site-action order is `About`, `Help`, `Submit Project`, then Ko-fi. Above
760px the orange support button shows a coffee icon and `Support Tavernary`.
At 760px and below it becomes an orange square with only the icon visible while
retaining the accessible name `Support Tavernary on Ko-fi`.

The button opens a Tavernary-styled modal around Ko-fi's cross-origin iframe:

`https://ko-fi.com/mentallyquill/?hidefeed=true&widget=true&embed=true&preview=true`

The iframe is mounted only after opening. The modal includes a short link to
the transparency page and a safe `Open directly on Ko-fi` fallback. Tavernary
does not inject styles into, inspect, or infer payment state from Ko-fi.

## Support page

`/support/` reuses the About page's narrow editorial layout and typography,
with small purpose-built cards for the monthly target and usage snapshot. It
contains:

1. A `$20 per month` operating target and Ko-fi support action.
2. An explicit rollover policy: donations first cover the current month's
   operating costs; anything above that amount carries forward to future
   Tavernary operating costs.
3. A ranked explanation of the principal variable cost drivers: LLM-assisted
   security scanning, update reassessment and catalog churn, then new-project
   intake and enrichment. No unsupported percentage allocation is shown.
4. A usage snapshot labeled as estimated or measured, including reporting
   period, input tokens, cached input tokens when measured, output tokens,
   model requests, and actual API cost when available.
5. The current estimate: roughly 45 million tokens and 4,000 calls per month at
   about a 9:1 input-to-output ratio. At GPT-5.6 Luna's July 30, 2026 Standard
   rates of $0.20/M input and $1.20/M output, that is about $13.50 per month
   before caching or unusual service-tier adjustments.
6. A plain-language model choice explanation: GPT-5.6 Luna is used because its
   reliable strict structured output has required fewer repair retries in
   Tavernary's workloads. DeepSeek V4 and GLM-5.2 were tested extensively but
   required more retries and model/configuration changes. These are Tavernary's
   observed results, not universal model rankings.
7. Methodology and privacy notes explaining that numbers change with community
   activity, pricing, caching, retries, and workload mix; no prompts, outputs,
   API keys, donor identities, or project/user identifiers are published.

The About page gains a `Sustainability and support` section summarizing the
$20 target, rollover policy, and link to `/support/`.

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

## Funding progress

Ko-fi remains the authority for live contribution and goal progress. Tavernary
does not maintain a second donation ledger or claim a payment total it cannot
verify. The page explains the $20 target and rollover policy beside the Ko-fi
embed; an active Ko-fi goal can provide live progress inside that frame.

## Accessibility and responsive behavior

Opening the dialog focuses its close button. Escape, the close button, or the
backdrop closes it; focus returns to the trigger. Focus is trapped, background
surfaces are inert, and page scrolling is locked. Desktop uses a centered
520px-wide panel. Mobile uses a safe-area-aware near-full-screen sheet without
horizontal overflow at 390px or 320px.

The support page uses semantic headings and descriptions, readable compact
numbers, and never relies on color alone to communicate estimate/measured state.

## Testing

- Unit tests cover the usage aggregator, pagination, required project scope,
  malformed responses, and stable snapshot output.
- Component tests cover the Support and About content plus modal lifecycle,
  URLs, accessibility, and fallback navigation.
- Workflow tests cover permissions, secret boundaries, schedule, scoped output,
  and validation before publication.
- Playwright tests cover static export, desktop/mobile header order and geometry,
  modal containment, focus restoration, and support-page rendering.
- The full repository check, production build, static-export verification, and
  focused visual inspection are required before publication.

## Non-goals

- A Tavernary payment backend or donor database.
- Publishing prompts, outputs, API keys, user/project identifiers, or daily
  organization-wide usage.
- Restyling Ko-fi's cross-origin contents.
- Claiming exact cost allocation percentages without measured evidence.
