# Tavernary public documentation design

**Date:** 2026-08-20

**Status:** Approved in conversation

## Goal

Rewrite Tavernary's public documentation so a new or young player can understand
what Tavernary is, how to use the catalog, how Kits and Help work, and how to
contribute. The documentation should be led by real screenshots and short,
plain-language explanations.

## Audience and scope

The public documentation is for visitors, players, project authors, Kit
authors, and contributors who may not know GitHub, repository vocabulary, or
Tavernary's internal systems.

The public rewrite includes:

- `README.md`
- `docs/README.md`
- `docs/guides/what-is-tavernary.md`
- `docs/guides/using-the-catalog.md`
- new visitor guides under `docs/guides/`
- `docs/contributing/contribution-overview.md`
- `docs/contributing/submission-and-review.md`
- `docs/contributing/kits.md`
- `docs/contributing/development-setup.md`
- safe, deterministic screenshots under `docs/assets/screenshots/`

Architecture, maintenance, exact reference, legal, security, and historical
Superpowers documents remain technical and are not rewritten for young players.

## Product story

The public docs should teach one focused idea: Tavernary is a living,
searchable catalog that helps people discover AI roleplay projects, understand
what they are, and reach the creator's source. Tavernary Companion extends that
ecosystem by managing extensions, but Tavernary itself does not host or install
the projects listed in the catalog.

The docs must keep these boundaries clear:

- Tavernary is a discovery index, not a file host, code host, marketplace,
  publishing platform, blog, forum, or social network.
- A project listing is not an endorsement or a promise that the project is
  safe, maintained, or right for every player.
- TavernKeeper combines deterministic scans with contextual review. Its result
  is evidence and safety awareness for a particular source revision, not an
  endorsement or a simple green/yellow/red truth label.
- Catalog facts, creator-written information, and Tavernary explanations are
  different kinds of information and should not be presented as interchangeable.
- Search, filtering, activity, popularity, and scan indicators should be
  explained in tooltips or short nearby copy when the meaning is not obvious.

## README section: Bounding the Problem

The main README will include a concise, original section named **Bounding the
Problem**. It will explain that the product is intentionally focused because a
small project cannot responsibly become an app store, support desk, social
network, code host, and safety authority at the same time.

It will summarize, without quoting the source conversation:

- the need for a clearer path from “I want something” to “I understand what it
  does and where it comes from”;
- the decision to make discovery and evaluation the center of Tavernary;
- the role of Companion as a connected extension manager rather than proof that
  Tavernary owns every project;
- the reason scan colors and labels must communicate meaningful risk without
  training people to treat every warning as harmless background noise; and
- the principle that new features should serve discovery, understanding,
  informed choice, or a clearly defined ecosystem job instead of expanding the
  product in every possible direction.

## Information architecture

The root README is a visual welcome page. `docs/README.md` is a task chooser.
Visitor guides explain the catalog, search, Kits, Help, and common words.
Contributor guides explain how to submit, correct, build, test, and maintain
Tavernary using direct language without hiding the required technical steps.

## Visual assets

Screenshots will be captured from deterministic local browser states and stored
under `docs/assets/screenshots/`. The intended set covers:

- the catalog on a wide screen;
- the catalog on a phone;
- search and filters;
- a project card and its source/activity/scan context;
- Kits and the Kit Builder;
- the Help hub; and
- the project submission review surface.

Each image needs useful alt text and a caption that tells the reader what to
notice. The supplied conversation screenshot is reference material only and is
not included in the repository.

## Language rules

- Speak to the reader as “you.”
- Prefer short sentences and direct verbs.
- Define a technical word when it first matters.
- Explain what each visible control helps the player do.
- Say who owns each fact: the creator, Tavernary, TavernKeeper, or GitHub/Codeberg.
- Never use a scan result as proof that a project is safe, approved, or good.
- Keep current limitations visible: Tavernary links to projects; it does not
  install or host them.

## Verification

Before completion:

- every local link in the public docs resolves;
- every referenced screenshot exists and is non-empty;
- README and visitor guides have useful visual coverage;
- public copy has no stale claims about installation, safety, ownership, or
  TavernKeeper;
- `git diff --check`, formatting, focused documentation checks, and the full
  repository test gate pass; and
- unrelated generated catalog state remains untouched.
