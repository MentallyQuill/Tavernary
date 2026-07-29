# What is Tavernary?

Tavernary is a search and discovery catalog for AI roleplay tools. It helps
people find projects, understand what they do, and reach the creator's own
repository or source page.

Tavernary is an index, not a package host. It does not host, mirror,
redistribute, install, or provide support for the project files listed in the
catalog. Creators remain responsible for their own source code, releases,
documentation, licenses, and support channels.

## What the catalog contains

V1 uses three public project kinds:

- **Frontends** — applications or interfaces used to interact with AI roleplay
  systems.
- **Extensions** — add-ons that extend a supported frontend or roleplay
  workflow.
- **System Presets** — reusable configuration or prompting resources published
  by their creators.

Frontends and Extensions require a public GitHub or Codeberg repository. This
gives Tavernary a stable canonical destination and allows machine-verifiable
repository facts to be refreshed. System Presets may instead link to another
stable public HTTPS source page.

The catalog is centered initially on the SillyTavern ecosystem while allowing
projects connected to other AI roleplay frontends, including Lumiverse and
Marinara Engine, where the catalog data supports that classification.

## What Tavernary records

Tavernary combines two kinds of information:

- **Curated metadata**, such as the project name, summary, project kind,
  supported frontends, capabilities, and canonical source.
- **Observed source facts**, such as repository identity, meaningful activity,
  releases, community counts, repository size, and root-license information.

These sources remain separate so automated refreshes do not silently rewrite
editorial descriptions or classifications. Some projects may therefore be
visible while their automated facts or editorial metadata are still pending.

## What inclusion means

Catalog inclusion is not an endorsement, certification, security guarantee, or
promise that a project is maintained. Review the project's own source page,
license, documentation, and release history before installing or using it.

Maintainers may pause refreshes, hide entries, remove unsafe or invalid
sources, or quarantine a record when repository identity or availability cannot
be safely confirmed.

## Why Tavernary is static-first

The initial product is deliberately build-time and GitHub-native. Tavernary has
no visitor accounts, production database, runtime API, or hosted project
packages. The published site is a static export deployed through GitHub Pages;
the source projects remain in their own repositories.

This keeps the project small to operate, makes the catalog inspectable in Git,
and keeps ownership of project files with their creators.

Project intake and authorized owner/staff changes use generated pull requests
as CI, audit, and rollback transactions. Tavernary can automatically publish
an exact validated transaction; the PR does not imply routine staff approval.
A separate post-publication Catalog Policy advisory can notify staff without
blocking, hiding, or removing the project.

## Learn more

- [Using the catalog](using-the-catalog.md)
- [Contribution overview](../contributing/contribution-overview.md)
- [Licensing](../../LICENSING.md)
- [Security policy](../../SECURITY.md)
