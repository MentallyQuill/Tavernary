# Contextual Frontend Eligibility Design

## Goal

Explain Tavernary's Frontend admission requirements without adding persistent
form clutter, and make the submission path honor the same policy.

## Interaction

- The About page states the complete catalog policy.
- The project submission builder shows the Frontend requirement only when
  `Project Type` is `Frontend`.
- Extension and System Preset paths show the requirement only after
  `Other or not listed` is selected for a supported Frontend.
- Existing Frontend selections do not repeat the policy.

## Policy

A Frontend must link to publicly accessible source code on GitHub or an
equivalent public source host. The code must be visible without signing in. An
open-source license is not required. Popularity and recent activity are not
admission requirements.

Tavernary links to creator-owned sources and does not redistribute their code.
Non-GitHub Frontends remain subject to maintainer review and do not receive
GitHub-derived activity or popularity metadata.

## Verification

Rendered component tests cover the hidden and visible disclosure states. The
submission admission and catalog-build tests cover public non-GitHub Frontend
sources while preserving the GitHub requirement for Extensions.
