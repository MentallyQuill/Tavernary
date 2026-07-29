# Described Primary Function Dropdown

## Goal

Replace the detached primary-function definition lists with a compact dropdown
whose open options show the same descriptions beneath their labels.

The change applies to:

- the public project submission form; and
- the owner **Edit card details** form.

## Interaction

The closed control shows either **Select a primary function** or the selected
option label. Opening it reveals the six approved Extension primary functions.
Each option contains:

- its existing label as the primary line; and
- its existing vocabulary description beneath it in smaller, muted text.

Selecting an option updates the existing primary-function ID and closes the
menu. The dropdown also closes on Escape and outside interaction.

Keyboard users can open the menu, move through options with Arrow Up and Arrow
Down, jump with Home and End, select with Enter or Space, and return focus to
the trigger after selection or dismissal. The active and selected options are
visually distinct. Touch targets remain at least 44 pixels high.

## Architecture

Add one shared, controlled React component for a single-select field with
described options. It accepts:

- field ID and label;
- current string value;
- placeholder text;
- vocabulary options containing `id`, `label`, and `description`;
- an `onChange` callback receiving the selected ID; and
- optional required, invalid, described-by, and error state.

The component owns only transient menu state and active-option navigation.
Both forms continue owning the selected primary-function value and all manifest
validation. No schema, vocabulary, transport, or submission behavior changes.

The component uses an accessible button/listbox pattern with explicit expanded,
controlled, active-descendant, option, and selected semantics. Existing focus,
control, muted-text, hover, and error color tokens provide its styling.

## Form Integration

The submission builder replaces its native primary-function `<select>` and
following definition list with the shared component. Its existing inline error
remains directly below the field.

The owner editor replaces only the editable Extension primary-function
`HelpSelectField` and its definition-list hint. Structural Frontend and System
Preset fields remain read-only and unchanged. Other native selects continue
using `HelpSelectField`.

## Error Handling

Required-field validation remains form-owned. When invalid, the trigger exposes
the same invalid state and error association as the current controls. An empty
value remains valid component state until the form validates it.

If the current value does not match an available option, the control displays
the placeholder and does not invent or coerce a value.

## Verification

Automated component tests will first fail against the current native selects,
then verify:

- descriptions are absent from the resting form and present inside the open
  menu;
- selection updates the existing form values and closes the menu;
- both submission and owner-editor integrations use the described dropdown;
- Arrow, Home, End, Enter, Space, and Escape behavior;
- outside-click dismissal and focus return;
- accessible label, expanded, selected, invalid, and error associations; and
- the existing submission and owner manifest flows remain unchanged.

Focused tests, the repository check suite, and a browser-width visual inspection
will verify the final implementation.
