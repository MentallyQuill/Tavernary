# Security Policy

Please do not disclose a Tavernary security vulnerability in a public issue.

Use Tavernary's private security route at `/help/security/`, which opens
GitHub's private vulnerability reporting flow at
`https://github.com/MentallyQuill/Tavernary/security/advisories/new`. Include
the affected URL or workflow, a concise description, reproduction steps, and
the potential impact. The maintainers will acknowledge the report and coordinate
any necessary disclosure after a fix is available.

Project-specific vulnerabilities belong with that project's creator. Tavernary
indexes links and public metadata; it does not host, mirror, redistribute, or
install cataloged project files.

TavernKeeper scan results are advisory observations of an exact GitHub commit.
They are not a Tavernary vulnerability-reporting channel and do not trigger
automatic listing moderation or owner notification. TavernKeeper's deterministic
scanner signals are reviewed in file and project context before a complete V5
technical report can publish; Tavernary then performs a separate automated
synthesis and enforces minimum-risk floors.

An individual report or Tavernary assessment cannot be manually dismissed,
edited, hidden, or recolored. A project maintainer who believes a finding
exposes a scanner or assessment-policy defect may use TavernKeeper's documented
appeal route with the immutable report and finding identity. Any correction is
a global, versioned policy change followed by an automatic complete rescan.
Tavernary staff may also request a normal scan of the repository's current
eligible SHA after a project changes, but cannot select or override its result.
See [the TavernKeeper integration documentation](docs/tavernkeeper-integration.md)
for the system boundary and operational recovery details.
