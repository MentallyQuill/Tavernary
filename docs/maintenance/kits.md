# Kit Maintenance

Kit publication and author edits use the issue workflows. The following two
maintainer operations use ordinary Git history so every exceptional change is
reviewable.

## Tavernary Pick

1. Edit only `tavernary_pick` in the canonical Kit record.
2. Do not change `updated_at`; Pick is Tavernary editorial metadata, not an
   author revision.
3. Run `npm run catalog:validate` and `npm run catalog:build`.
4. Merge the change through a reviewed pull request.

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
