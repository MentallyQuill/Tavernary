# Kit Maintenance

Valid Kit creates, author edits, and trusted Tavernary staff edits publish
automatically through the issue workflows. Discovery is community-driven:
community support feeds Trending, with no maintainer-curated endorsement.

Trusted edits use `editAuthority: "tavernary-staff"`. Authority requires the
actor's immutable GitHub ID in
`data/maintenance/trusted-tavernary-editors.json` and a current trusted
repository association; association alone does not grant access. Triage and the
final publisher both validate the refreshed issue actor. A staff edit preserves
the canonical author, Kit `id`, source issue, `published_at`, and support
snapshot identity. It never substitutes the staff issue author for Kit
provenance.

The following exceptional maintainer operation uses ordinary Git history so
every change is reviewable.

## Safety repair

Use this only for a narrow repair to unsafe Kit content.

1. Preserve `id`, the author numeric ID, source issue, and `published_at`.
2. Optionally refresh the displayed author login only after verifying the
   matching GitHub numeric identity.
3. Change only the unsafe title, description, or project-stack content.
4. Advance `updated_at`.
5. Preserve the support snapshot without rewriting its history.
6. Run the complete catalog gates with `npm run check`.
7. Merge through a reviewed pull request whose commit and PR history identify
   the maintainer safety repair.
