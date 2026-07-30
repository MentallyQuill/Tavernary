# Copy GitHub Form URL

## Goal

Give project submitters a non-navigating alternative to **Continue on GitHub**.
This lets someone paste the completed Issue Form URL directly into a browser
when GitHub Mobile intercepts links or when they do not want Tavernary to open a
new tab.

## Placement and appearance

The control belongs on the project submission review screen, immediately to the
right of **Continue on GitHub**. It does not belong beside **Review submission**:
the review step must first validate and finalize Tavernary's authoritative
manifest.

The two controls form one action group on desktop, tablet, and mobile:

`[ Continue on GitHub ][ link icon ]`

The new control is a 44 by 44 pixel square secondary button. It reuses
Tavernary's existing `copy-link` SVG. The primary button may grow to fill the
available width, but the copy control remains square on narrow screens.

The button has:

- accessible name: **Copy GitHub form URL**
- hover and keyboard-focus tooltip: **Copy URL and paste into browser**

Because phones do not have hover, a quiet explanatory line appears beneath the
action group:

> Prefer to open it yourself? Copy the completed URL and paste it into your
> browser.

## Behavior

Both actions use the same reviewed manifest and the same URL preparation logic.
The existing primary action opens the prepared GitHub Issue Form. The new
secondary action copies that prepared URL without calling `window.open` or
otherwise navigating.

After a successful copy, the existing review status region announces:

> GitHub form URL copied. Paste it into your browser's address bar.

The copy control remains enabled so the action can be repeated. Copying does not
leave the review screen, clear the form, or mark the GitHub handoff as opened.

If clipboard access fails, Tavernary reveals the complete URL as selectable text
and tells the submitter to copy it manually. The URL is not rendered as a link,
because tapping it could invoke GitHub Mobile and recreate the original problem.

## Oversized submissions

GitHub cannot accept an arbitrarily long prefilled URL. When the complete
submission exceeds Tavernary's safe URL limit, the URL-only alternative cannot
carry the authoritative manifest by itself. In that case, the copy action does
not copy an incomplete URL. It explains that the submission is too large for a
single URL and directs the submitter to **Continue on GitHub**, which retains the
existing separate manifest-copy recovery.

## Implementation boundaries

URL construction must be separated from navigation so both actions consume one
prepared handoff result. No manifest schema, Issue Form field, automation
authority, or submission validation rule changes as part of this feature.

The shared review component receives a `copyReviewUrl` callback alongside its
existing `openReview` callback. Project-specific serialization remains in the
project submission transport, and both callbacks consume the same shared URL
preparation function. The component renders the copy control only when
`copyReviewUrl` is provided, so other Tavernary review handoffs remain unchanged.

## Verification

Automated coverage must prove:

- the copied URL is byte-for-byte the URL the primary action would open;
- copying never calls `window.open`;
- success is announced in the existing live status region;
- clipboard failure reveals selectable, non-clickable URL text;
- oversized submissions do not copy an incomplete URL;
- the existing GitHub-opening action and manifest fallback still work;
- the primary and square secondary controls remain adjacent at desktop, tablet,
  and mobile widths;
- the tooltip appears on hover and keyboard focus where Tavernary permits
  tooltips, while the button retains its accessible name on mobile.
