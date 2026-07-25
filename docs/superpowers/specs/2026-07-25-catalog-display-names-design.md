# Catalog Display Names Design

## Goal

Remove a leading `SillyTavern` brand prefix from project names shown on catalog cards without changing canonical catalog data or names that mention SillyTavern later.

## Display rule

- Match `SillyTavern` case-insensitively only at the start of a project name.
- Require the prefix to be followed by whitespace, a hyphen, or an underscore.
- Remove the prefix and all adjacent separator characters.
- Leave the name unchanged when `SillyTavern` appears later.
- Leave the standalone name `SillyTavern` unchanged so the formatter never produces an empty title.

Examples:

- `SillyTavern ReMemory` becomes `ReMemory`.
- `sillytavern-Namegen` becomes `Namegen`.
- `SillyTavern_Extension Mermaid` becomes `Extension Mermaid`.
- `RPG Tracker for SillyTavern` remains unchanged.
- `datacat SillyTavern Browser` remains unchanged.

## Architecture

Add one pure display-name formatter beside the catalog card component and use its result for both visible title text and the card link's accessible name. The stored `project.name`, search index, sorting, Kit data, repository identity, and generated catalog remain unchanged.

## Verification

A component-level regression test will render real catalog cards and verify the visible and accessible names for leading, case-insensitive, separator-delimited prefixes as well as non-leading occurrences. Focused unit tests, type checking, and linting will verify the finished change.
