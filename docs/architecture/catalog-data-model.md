# Catalog data model

Tavernary is a link aggregator. It indexes project metadata and points visitors
to each project's canonical source; it does not host project files.

## Authority boundaries

- Curated project records contain editorial decisions, compatibility, and a
  permanent source identity. Automated refreshes never rewrite these files.
- Repository snapshots contain GitHub-derived facts and activity calculations.
  The daily updater owns these generated files.
- The browser catalog joins published curated records with their latest
  snapshots into a generated, static site artifact.

Frontend and extension records require a GitHub source with a permanent numeric
repository ID. Presets may instead use a stable HTTPS source URL. URL-backed
presets are manually verified and use a paused refresh policy.

`visibility` lets curators publish, quarantine, or disable a record.
`refresh_policy` independently permits or pauses automated source updates.
Repository identity mismatches must stop refresh and enter curator review.

The `seed` cohort is excluded from the New view so launch-day imports do not all
appear newly released. Standard records use their catalog intake time for that
view; repository creation time remains separate snapshot metadata.
