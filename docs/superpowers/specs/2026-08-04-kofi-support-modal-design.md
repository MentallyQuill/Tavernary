# Ko-fi Support Modal Design

## Goal

Add a compact Ko-fi support action immediately to the right of `Submit Project`
and let visitors complete the Ko-fi flow without leaving Tavernary. The outer
experience follows Tavernary's orange visual language while the embedded form
remains owned and rendered by Ko-fi.

## Header Action

The site-action order is `About`, `Help`, `Submit Project`, then Ko-fi. The new
control is a semantic button with the accessible name `Support Tavernary on
Ko-fi`.

- Above 760px, the button shows a recognizable Ko-fi coffee-cup icon and the
  visible label `Support Tavernary`.
- At 760px and below, the visible label is hidden and the button becomes a
  square orange icon control.
- Default, hover, pressed, and focus states reuse Tavernary's existing primary
  action and focus-ring tokens.
- The icon remains recognizable as Ko-fi and is not stretched or materially
  altered.

## Modal Shell

Activating the header control lazily mounts a modal dialog. Tavernary owns the
backdrop, title bar, loading treatment, close control, responsive sizing, and
fallback link. The dialog title is `Support Tavernary`.

On desktop, the dialog is a centered panel with a 520px maximum width and a
maximum height bounded by the dynamic viewport. On mobile, it becomes a
near-full-screen sheet using dynamic viewport units and safe-area padding.
Tavernary's page is locked behind the dialog while the Ko-fi content owns the
remaining internal scroll area.

The iframe source is:

`https://ko-fi.com/mentallyquill/?hidefeed=true&widget=true&embed=true&preview=true`

It uses a descriptive title and is created only after the visitor opens the
dialog. The outer shell does not attempt to inject CSS into or inspect the
cross-origin Ko-fi document. A visible `Open directly on Ko-fi` link targets
`https://ko-fi.com/mentallyquill` in a new tab with safe external-link
attributes.

## Interaction and Accessibility

- Opening the dialog moves focus to its close button.
- Escape, the close button, or a pointer press on the backdrop closes it.
- Keyboard focus wraps within the dialog while it is open.
- Closing restores focus to the Ko-fi header button.
- Background surfaces are inert and body scrolling is locked while open.
- The iframe has the title `Support Tavernary on Ko-fi`.

## Failure Handling

The shell presents a neutral loading state while Ko-fi loads. The direct Ko-fi
link remains available independently of iframe state, so visitors retain a
working support path if the embed is blocked or slow. Tavernary does not infer
payment completion or read Ko-fi state.

## Testing

Focused component tests cover the closed state, lazy iframe creation, accessible
dialog semantics, close paths, iframe source/title, and direct-link safety.
Playwright coverage proves the header order, desktop label, mobile icon-only
square geometry, modal viewport containment, page scroll lock, Escape dismissal,
focus restoration, and absence of horizontal overflow at 390px and 320px.

## Non-goals

- Restyling Ko-fi's cross-origin form contents.
- Using Ko-fi's viewport-floating overlay script.
- Tracking donations or payment events.
- Adding another support destination or a dedicated support page.
