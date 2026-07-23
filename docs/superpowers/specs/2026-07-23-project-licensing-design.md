# Tavernary Project Licensing Design

**Date:** 2026-07-23

**Status:** Approved

## Purpose

Tavernary will remain genuinely open source while requiring publicly used
software improvements and shared catalog derivatives to remain available to
the community. The project identity remains separately controlled so forks
cannot present themselves as the official Tavernary service.

## License Boundaries

### Software

All Tavernary software, including application source, build scripts,
configuration, and future server code, is licensed under
`AGPL-3.0-only` unless a file explicitly states otherwise.

The repository root `LICENSE` file contains the complete GNU Affero General
Public License version 3 text. A short `LICENSING.md` file explains how the
license applies across the repository.

### Catalog Database

The Tavernary catalog database is licensed under `ODbL-1.0`. Catalog files
will live under `data/catalog/` or another path explicitly identified in
`LICENSING.md`.

The ODbL applies only to rights Tavernary contributors can license. It does
not claim ownership of third-party project names, trademarks, source
material, or facts that are not protected by applicable law.

The complete ODbL 1.0 text is stored in `LICENSES/ODbL-1.0.txt`.

### Brand Assets

The Tavernary name, logos, original illustrations, mascots, and other
distinctive brand assets are excluded from the AGPL and ODbL grants unless a
specific asset says otherwise. These materials remain all rights reserved.

`TRADEMARKS.md` permits truthful references to Tavernary while prohibiting
uses that imply sponsorship, endorsement, affiliation, or official status.
Forks must use a different name and visual identity.

Third-party names and marks remain the property of their respective owners.

## Ownership Wording

Repository notices use the neutral collective wording “Tavernary
contributors.” No personal legal name or unformed corporate entity is
asserted as the rights holder.

## Files Added

- `LICENSE`: complete AGPL 3.0 license text;
- `LICENSES/ODbL-1.0.txt`: complete ODbL 1.0 license text;
- `LICENSING.md`: plain-language scope and file-boundary explanation;
- `TRADEMARKS.md`: brand-use policy.

No contributor license agreement is introduced in this change. If Tavernary
later needs proprietary dual licensing or centralized relicensing authority,
that requires a separate contributor-policy decision before accepting
outside contributions.

## Verification

The implementation is complete when:

1. both standard license texts match their canonical versions;
2. the scope document unambiguously assigns software, database, and brand
   materials;
3. no current project file is accidentally assigned conflicting terms;
4. Git reports only the intended licensing files as changed.
