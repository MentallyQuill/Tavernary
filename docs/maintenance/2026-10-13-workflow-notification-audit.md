# Workflow notification audit: October 13, 2026

The GitHub notification inbox contains 46 notifications updated since October 8 UTC, including 39 workflow failure alerts. All recent notifications belong to MentallyQuill/Tavernary. Reviewed failure logs, current main, merged fixes and subsequent successful runs; notification unread/done state was left unchanged.

## Active recurring failures

| Group | Root cause | Evidence and repair |
| --- | --- | --- |
| Policy advisory, catalog refresh, TavernKeeper report import | Request CLI awaits inventory. Inventory dynamically imports the downloader from writer-runtime, which statically imports the suspended request CLI. The circular module evaluation cannot settle; Node exits 13 when event-loop handles drain. | [Policy October 13](https://github.com/MentallyQuill/Tavernary/actions/runs/38400934633), [report import](https://github.com/MentallyQuill/Tavernary/actions/runs/38329837887), [catalog refresh](https://github.com/MentallyQuill/Tavernary/actions/runs/38279845067). Extract the binary downloader into a leaf module; preserve integrity, identity, size and timeout checks. Test all three actual scheduled CLI entrypoints with native diagnostic downloads and offline IO. |
| Reddit enrichment, frontend and fork retries | Checkout-free jobs invoke gh workflow run without a repository, causing fatal not-a-git-repository errors before dispatch. | [Reddit](https://github.com/MentallyQuill/Tavernary/actions/runs/38280877453), [frontend](https://github.com/MentallyQuill/Tavernary/actions/runs/38146710701), [fork](https://github.com/MentallyQuill/Tavernary/actions/runs/38146710676). Pass the current GitHub repository explicitly; execute the real workflow commands outside a checkout in regression tests. |
| Writer supersession noise | Recognized stale-input races use the input-superseded classification but still return exit 1. | [Writer October 12](https://github.com/MentallyQuill/Tavernary/actions/runs/38274344637) and [later writer](https://github.com/MentallyQuill/Tavernary/actions/runs/38283395713). Return sanitized superseded status and exit 0 only in reconcile mode for this exact classification. Keep other modes failed because manual owner inputs are not recovered by scheduled reconciliation. |

[Yesterday's fix, PR 864](https://github.com/MentallyQuill/Tavernary/pull/864), repaired false investigation classification and retry receipts. It did not change the checkout-free dispatch commands or the circular downloader import. Several failures occurred after it merged.

## Historical failures with verified recovery

- PRs [865](https://github.com/MentallyQuill/Tavernary/pull/865) and [866](https://github.com/MentallyQuill/Tavernary/pull/866): visual baselines and tests measuring controls before animations settled. Both merged after passing final validation: [865 CI](https://github.com/MentallyQuill/Tavernary/actions/runs/38273170473), [866 CI](https://github.com/MentallyQuill/Tavernary/actions/runs/38281834286).
- Dependency PR [819](https://github.com/MentallyQuill/Tavernary/pull/819): generation-budget bookkeeping fixture, followed by [successful final CI](https://github.com/MentallyQuill/Tavernary/actions/runs/38112020834) and merge.
- October 9 deployment and runtime checks: live deployment state contaminated unit fixtures; Windows Git fixture timeouts. PRs 821 and 823 repaired these. [Deployment recovery](https://github.com/MentallyQuill/Tavernary/actions/runs/37889331044) and [runtime recovery](https://github.com/MentallyQuill/Tavernary/actions/runs/37889368066) passed; subsequent deployment runs stayed green through [latest checked deployment](https://github.com/MentallyQuill/Tavernary/actions/runs/38284578366).
- Recovery canary: generated target omissions, fixture contamination and incorrect production base path were repaired in PRs 821, 823 and 825. [Subsequent canary](https://github.com/MentallyQuill/Tavernary/actions/runs/37900115670) passed; the legacy workflow is retired.
- October 9 writer alerts: GitHub API rate limits, rather than an expired owner token. PRs 827 and 852 reduced inventory reads and added durable backoff. [Latest checked writer](https://github.com/MentallyQuill/Tavernary/actions/runs/38327818702) successfully deferred at its request budget; this proves bounded deferral, not completed reconciliation.

## Verification boundary

The regressions failed against the previous implementation and passed after repair. Full npm run check passed: formatting, lint, palette and catalog validation, 1,126 report summaries, typecheck, all 3,747 tests across 334 files, production build and static export verification. Independent combined review found no remaining actionable issues. Production schedule recovery remains unverified until the repair is merged and the affected workflows execute current main.
