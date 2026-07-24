# Card Tooltips and Issue Chooser Design

## Goal

Improve catalog discoverability without changing the approved card layout, and make GitHub's issue chooser reflect the most common support paths without publishing a security-report form.

## Catalog navigation

Desktop category buttons keep their current nine-column geometry. The icon and label inside every button are centered as one unit with `justify-content: center` and centered text.

## Card tooltips

The existing accessible `Tooltip` component remains the single tooltip implementation. Every compact fact or label on a card receives plain-language hover and keyboard-focus help:

- project type/function icon;
- 12-week activity value and graph;
- last meaningful commit age;
- aggregate community score;
- repository size;
- preset version, publication/source status, and artifact size;
- project title and clamped summary;
- every frontend and capability chip;
- license status.

The visible last-commit age uses bold weight. Tooltips explain the underlying fact rather than repeating its label. Activity help explains both the `x/12` value and the six two-week bars. Community help identifies the score as the sum of stars, forks, and subscribers.

Frontend and capability descriptions live in their vocabulary JSON entries. The catalog builder emits `{ id, label, description }` so cards do not maintain a second copy of the same definitions. Tooltips align left when attached near the left edge of a card and right otherwise, preventing avoidable overflow.

On touch-sized layouts the existing responsive rule continues to suppress floating tooltip bubbles; the visible facts remain present.

## GitHub issue chooser

Repository-owned forms are ordered by numeric filename prefixes:

1. Submit a project
2. Report project information
3. Report a website bug
4. Other

The generic Request help form is removed because it is not part of the approved chooser and overlaps the more specific routes. The custom security `contact_link` is removed because `SECURITY.md` already creates GitHub's private security-policy entry. GitHub's maintainer-only Blank issue and built-in Report a security vulnerability entries remain after the repository-owned forms in GitHub-controlled order.

This intentionally favors a private security-report path over exact interleaving with public issue forms.

## Verification

- Unit tests prove vocabulary descriptions are emitted and chooser files/config are exact.
- Browser tests prove category content is centered, the commit age is bold, each card fact has an accessible tooltip, and representative tooltips become visible on hover.
- Existing unit, build, end-to-end, and visual suites must remain green.
- Final visual review compares the updated local render to the supplied screenshots and production layout before deployment.
