# TavernKeeper Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TavernKeeper into an exact-SHA, fail-closed, hybrid repository scanner that publishes immutable sanitized reports for Tavernary.

**Architecture:** TavernKeeper reconciles Tavernary's public target manifest into batches of at most five repositories and scans at most two repositories concurrently on disposable GitHub-hosted runners. Each isolated job performs safe inventory, all applicable deterministic scanners, and required chunked review through a runtime-configured OpenAI-compatible model; a separate serialized publisher validates sanitized candidates, commits immutable reports and operational state to `main`, deploys GitHub Pages, and wakes Tavernary.

**Tech Stack:** Node.js 24, TypeScript 6 strict mode, Zod 4, Vitest 4, GitHub Actions, GitHub Pages, OpenAI-compatible Chat Completions (release configuration: NanoGPT `deepseek/deepseek-v4-flash`), Gitleaks 8.30.1, OpenGrep 1.26.0, OSV-Scanner 2.4.0, zizmor 1.28.0, malcontent 1.25.7

## Global Constraints

- Preserve the existing commits `00b24e2` and `360c57a` and the frozen untracked model/orchestrator files as reviewable starting material; do not delete them to hide the premature implementation.
- Use only the public Tavernary target manifest as automatic scan authority; no public scan endpoint, issue command, comment command, or requester-supplied clone URL is allowed.
- Only TavernKeeper staff with repository write permission may invoke retry, deep-scan, policy-rescan, pause, resume, or adjudication workflows.
- Scan GitHub repositories only. Codeberg, URL-only, organization-level, and private sources are outside V1.
- Never execute target hooks, Actions, packages, scripts, tests, builds, macros, binaries, interpreters, containers, submodules, or Git LFS content.
- Every published scan is bound to one positive GitHub repository ID, one canonical repository name, and one full lowercase 40-character SHA.
- Every applicable deterministic scanner and every required configured-model call must complete; otherwise publish no report.
- Do not add a fallback model, fixed per-repository aggregate token cap, whole-job token estimate, or degraded report mode.
- Use deterministic byte-bounded model chunks; every eligible file required by the selected scan mode must receive a valid provider response.
- A report result is `green` or `yellow`; incomplete and failed operations are operational state and never public reports.
- Yellow requires at least one active finding whose severity and confidence are both medium or higher.
- Keep report JSON and HTML free of raw secrets, source excerpts, reusable payloads, raw scanner output, raw model output, prompts, checkout paths, and credentials.
- Keep code and reports on the normal `main` branch. Do not add a generated branch or third repository.
- Derive batches from desired targets minus completed current reports; use at most five targets per batch and two concurrent repository jobs.
- Retry the same classified error at `T+1`, `T+2`, and `T+3` hours; notify TavernKeeper staff only after the third retry fails.
- A repository-specific failure must not block unrelated repositories. A system-wide failure must engage the circuit breaker and prevent later batches.
- Pin every first-party Action to a full commit SHA and every scanner asset to an exact version and verified digest or exact source commit.
- License TavernKeeper under AGPL-3.0; third-party scanners remain separate programs under their own licenses.

---

## File and Interface Map

### Existing files to replace or extend

- `src/contracts/targets.ts`: strict target-manifest parsing and canonical GitHub identity checks.
- `src/contracts/reports.ts`: complete-only report, report-index, finding, coverage, and usage contracts.
- `src/process/command-runner.ts`: shell-free subprocess execution with timeout, output, and environment isolation.
- `src/git/checkout.ts`: exact-SHA fetch, detached verification, bounded history, and safe cleanup.
- `src/inventory/inventory-handler.ts`: link-safe inventory and file classification.
- `src/scanners/static-rules.ts`: TavernKeeper-owned lightweight structural detectors and redaction.
- `src/scanners/external-tools.ts`: split into focused scanner adapters; retain only shared orchestration/types here.
- `src/model/minimax-review.ts`: legacy provider-specific file to rename and replace with required model-agnostic chunk orchestration.
- `src/orchestrator/scan-handler.ts`: atomic complete-or-error scan orchestration.

### New policy, contracts, and rules

- `config/scanner-policy.v1.json`: versioned security ceilings, applicability, chunk, timeout, and report policy.
- `config/scanners.v1.json`: pinned scanner release URLs, digests, and malcontent source commit.
- `schemas/tavernary-targets.v1.schema.json`: public target-manifest JSON Schema.
- `schemas/scan-report.v1.schema.json`: public immutable report JSON Schema.
- `schemas/report-index.v1.schema.json`: public preferred-report index JSON Schema.
- `rules/opengrep/*.yml`: TavernKeeper-owned credential, network, execution, install, persistence, and obfuscation rules.
- `rules/dismissals.json`: staff-reviewed reusable finding dismissals.

### New implementation modules

- `src/config/policy.ts`: load and validate the versioned policy.
- `src/git/history.ts`: bounded ancestor and changed-file planning.
- `src/inventory/classify.ts`: first-party/model eligibility and optional-scanner applicability.
- `src/inventory/archive-guards.ts`: bounded archive inspection policy.
- `src/scanners/types.ts`: scanner adapter inputs and normalized results.
- `src/scanners/gitleaks.ts`, `opengrep.ts`, `osv.ts`, `zizmor.ts`, `malcontent.ts`: focused adapters.
- `src/scanners/run-scanners.ts`: required/applicable scanner coordinator.
- `src/model/redaction.ts`: stable secret-like literal replacement.
- `src/model/corpus.ts`: standard/deep eligible corpus selection.
- `src/model/chunker.ts`: deterministic byte-bounded chunks and semantic splits.
- `src/model/openai-compatible-client.ts`: one strict provider request with usage extraction.
- `src/model/chunk-cache.ts`: sanitized content-addressed chunk-result cache.
- `src/model/synthesis.ts`: final normalized-finding synthesis.
- `src/queue/backlog.ts`: target reconciliation, coalescing, priority, age boost, and five-target batches.
- `src/operations/state.ts`: `operations/state.json` parsing and atomic transitions.
- `src/operations/retry.ts`: error fingerprinting and `T+1/T+2/T+3` transitions.
- `src/operations/telemetry.ts`: secret-free run counters, timings, usage, and allowance warnings.
- `src/publish/sanitize.ts`: final public-content rejection gate.
- `src/publish/report-path.ts`: report ID, immutable path, and preferred-report selection.
- `src/publish/render-report.ts`: escaped, script-free static report HTML.
- `src/publish/publisher.ts`: serialized report/state/index transaction.
- `src/adjudication/adjudicate.ts`: immutable staff dismissal reports.
- `src/site/build-site.ts`: Pages staging directory builder.
- `src/cli/*.ts`: reconcile, prepare-target, review-target, finalize-target, publish, retry, deep-scan, policy-rescan, adjudicate, and site commands.

### Workflows and operator surfaces

- `.github/workflows/ci.yml`: source, rules, schema, hostile-fixture, and workflow-policy checks.
- `.github/workflows/reconcile.yml`: six-hour/wake/continuation reconciliation and maximum-two scan matrix.
- `.github/workflows/deploy-pages.yml`: reusable/manual exact-SHA Pages deployment, public verification, and Tavernary wake.
- `.github/workflows/retry.yml`: hourly due-retry reconciler.
- `.github/workflows/deep-scan.yml`: staff-only protected deep scan.
- `.github/workflows/policy-rescan.yml`: staff-only policy campaign.
- `.github/workflows/adjudicate.yml`: staff-only protected appeal adjudication.
- `.github/ISSUE_TEMPLATE/false-positive.yml`: report-and-fingerprint appeal form that never triggers scanning.
- `operations/state.json`: secret-free retry and circuit-breaker state.
- `reports/index.json`: deterministic preferred-report index.
- `docs/architecture.md`, `docs/operations.md`, `docs/rules.md`, `SECURITY.md`, `README.md`, `LICENSE`: public and staff documentation.

---

### Task 1: Replace the Frozen Contracts with the Approved Complete-Only V1 Contracts

**Files:**
- Modify: `src/contracts/targets.ts`
- Modify: `src/contracts/reports.ts`
- Create: `schemas/tavernary-targets.v1.schema.json`
- Create: `schemas/scan-report.v1.schema.json`
- Create: `schemas/report-index.v1.schema.json`
- Create: `tests/fixtures/contracts/targets.valid.json`
- Create: `tests/fixtures/contracts/report.valid.json`
- Create: `tests/fixtures/contracts/index.valid.json`
- Modify: `tests/contracts.test.ts`

**Interfaces:**
- Produces: `TargetManifestSchema`, `ScanReportSchema`, `ReportIndexSchema`, `FindingSchema`, `deriveResult(findings)`, and their inferred TypeScript types.
- Contract rule: `ScanReport.result` is only `green | yellow`; tool coverage is only `completed | not-applicable`; model coverage is always completed in a valid report.

- [ ] **Step 1: Write failing contract tests for exact identity, unknown-field rejection, confidence threshold, and complete-only publication**

```ts
test("derives yellow only from active medium-confidence review-level findings", () => {
  expect(deriveResult([finding({ severity: "medium", confidence: "medium" })])).toBe("yellow");
  expect(deriveResult([finding({ severity: "low", confidence: "high" })])).toBe("green");
  expect(deriveResult([finding({ severity: "high", confidence: "low" })])).toBe("green");
  expect(deriveResult([finding({ severity: "critical", confidence: "high", disposition: "dismissed" })])).toBe("green");
});

test("rejects incomplete reports and mismatched canonical GitHub URLs", () => {
  expect(ScanReportSchema.safeParse({ ...validReport, result: "incomplete" }).success).toBe(false);
  expect(TargetManifestSchema.safeParse({
    ...validTargets,
    repositories: [{ ...validTargets.repositories[0], canonical_url: "https://github.com/other/repo" }],
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run the contract tests and verify the frozen contract fails**

Run: `npm test -- tests/contracts.test.ts`

Expected: FAIL because the frozen schema has no confidence/disposition/report identity and still permits incomplete/failed status values.

- [ ] **Step 3: Implement the canonical V1 types and result derivation**

```ts
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const SeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export const DispositionSchema = z.enum(["active", "dismissed"]);
export const PublicResultSchema = z.enum(["green", "yellow"]);

export function deriveResult(findings: Finding[]): PublicResult {
  return findings.some((item) =>
    item.disposition === "active" &&
    ["critical", "high", "medium"].includes(item.severity) &&
    ["high", "medium"].includes(item.confidence),
  ) ? "yellow" : "green";
}
```

Define findings with `origin`, `rule_id`, `category`, `severity`, `confidence`, `path`, `line_start`, `line_end`, `evidence_sha`, `title`, `explanation`, optional `remediation`, optional TavernKeeper rule-documentation `reference_url`, `fingerprint`, and `disposition`. Define reports with report/scanner/policy/prompt versions, identity, mode, completion/history, per-tool coverage, inventory/exclusion totals, exact provider usage, result, counts, and sanitized findings. Define index entries as the approved concise identity, version, result, count, coverage, and immutable URL projection.

- [ ] **Step 4: Write matching strict JSON Schemas and shared valid fixtures**

The JSON Schemas must use `additionalProperties: false` at every object level and the same enum, bounds, patterns, nullable fields, and URL prefixes as the Zod schemas. The three fixture files become the copies Tavernary vendors in its consumer tests.

- [ ] **Step 5: Run focused and full contract checks**

Run: `npm test -- tests/contracts.test.ts && npm run typecheck`

Expected: PASS with no disabled, skipped, incomplete, failed, or safe report vocabulary.

- [ ] **Step 6: Commit the contract replacement**

```bash
git add src/contracts schemas tests/contracts.test.ts tests/fixtures/contracts
git commit -m "feat(contracts): define complete scan reports"
```

### Task 2: Add the Versioned Security and Scanner Policy

**Files:**
- Create: `config/scanner-policy.v1.json`
- Create: `config/scanners.v1.json`
- Create: `src/config/policy.ts`
- Create: `tests/policy.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadScannerPolicy(path): ScannerPolicy` and `loadScannerPins(path): ScannerPins`.
- Consumes: contract version names from Task 1.

- [ ] **Step 1: Write failing tests for immutable policy identity and safe bounds**

```ts
test("loads the V1 policy with five-target and two-runner limits", async () => {
  const policy = await loadScannerPolicy("config/scanner-policy.v1.json");
  expect(policy.version).toBe("1");
  expect(policy.queue).toEqual({ batchSize: 5, maxParallel: 2 });
  expect(policy.history.maxCommits).toBe(20);
  expect(policy.model.protocol).toBe("openai-compatible-chat-completions");
  expect(policy.model).not.toHaveProperty("provider");
  expect(policy.model).not.toHaveProperty("id");
  expect("aggregateRepositoryTokenCap" in policy.model).toBe(false);
});
```

- [ ] **Step 2: Run the policy test and verify it fails**

Run: `npm test -- tests/policy.test.ts`

Expected: FAIL because policy files and loader do not exist.

- [ ] **Step 3: Create the initial V1 policy with explicit resource-safety ceilings**

```json
{
  "version": "1",
  "queue": { "batchSize": 5, "maxParallel": 2 },
  "history": { "maxCommits": 20 },
  "inventory": {
    "maxFiles": 500000,
    "maxTotalBytes": 5368709120,
    "maxFileBytes": 268435456,
    "maxArchiveDepth": 4,
    "maxExpandedArchiveBytes": 1073741824,
    "maxCompressionRatio": 200
  },
  "commands": { "timeoutMs": 2700000, "maxOutputBytes": 104857600 },
  "model": {
    "protocol": "openai-compatible-chat-completions",
    "chunkBytes": 524288,
    "chunkOverlapBytes": 8192,
    "maxOutputTokensPerChunk": 8192,
    "maxSynthesisOutputTokens": 8192
  },
  "retry": { "hoursFromInitialFailure": [1, 2, 3] }
}
```

These are security ceilings, not total model-budget estimates. A repository above them enters the staff-only oversized path and never silently receives reduced coverage.

- [ ] **Step 4: Pin scanner provenance in `config/scanners.v1.json`**

Use these reviewed Linux x64 pins:

```json
{
  "gitleaks": {
    "version": "8.30.1",
    "url": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz",
    "sha256": "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
  },
  "opengrep": {
    "version": "1.26.0",
    "url": "https://github.com/opengrep/opengrep/releases/download/v1.26.0/opengrep_manylinux_x86",
    "sha256": "40c21299eeddabf743b856daa843d24f9d4a027130671cd45b3b21776fd9ab26"
  },
  "osvScanner": {
    "version": "2.4.0",
    "url": "https://github.com/google/osv-scanner/releases/download/v2.4.0/osv-scanner_linux_amd64",
    "sha256": "15314940c10d26af9c6649f150b8a47c1262e8fc7e17b1d1029b0e479e8ed8a0"
  },
  "zizmor": {
    "version": "1.28.0",
    "url": "https://github.com/zizmorcore/zizmor/releases/download/v1.28.0/zizmor-x86_64-unknown-linux-gnu.tar.gz",
    "sha256": "e87b67160194884e375a46a12c57ccc904f762b53845f254fab7f17d98809c09"
  },
  "malcontent": {
    "version": "1.25.7",
    "repository": "https://github.com/chainguard-dev/malcontent.git",
    "commit": "790a3df22393eb9a9c43be78925a3aafee9e1fdb",
    "go": "1.26.5"
  }
}
```

- [ ] **Step 5: Implement strict Zod loaders and run checks**

Run: `npm test -- tests/policy.test.ts && npm run typecheck`

Expected: PASS; mutation of a queue limit, digest length, unknown field, or retry schedule fails parsing.

- [ ] **Step 6: Commit the policy**

```bash
git add config src/config package.json tests/policy.test.ts
git commit -m "feat(policy): pin scanner security policy"
```

### Task 3: Harden Shell-Free Commands and Exact-SHA Checkout

**Files:**
- Modify: `src/process/command-runner.ts`
- Modify: `src/git/checkout.ts`
- Create: `src/git/history.ts`
- Modify: `tests/checkout.test.ts`
- Create: `tests/command-runner.test.ts`
- Create: `tests/history.test.ts`

**Interfaces:**
- Produces: `CommandRunner.run(command, args, options)`, `checkoutExactTarget(spec)`, `verifyExactHead(root, sha)`, and `planHistory(root, previousShas, runner)`.
- Checkout result: `{ directory, headSha, historyCommits }`; cleanup remains the caller's `finally` responsibility.

- [ ] **Step 1: Add failing tests for hostile arguments, disabled Git features, HEAD mismatch, and bounded ancestry**

```ts
expect(runner.calls.every((call) => call.options.shell === false)).toBe(true);
expect(fetchCall.args).toContain("--depth=20");
expect(fetchCall.options.environment).toMatchObject({
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_LFS_SKIP_SMUDGE: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_PROTOCOL_FROM_USER: "0",
});
expect(result).toMatchObject({ ok: false, error: { code: "HEAD_MISMATCH" } });
```

- [ ] **Step 2: Run the checkout/runner/history tests and verify failure**

Run: `npm test -- tests/checkout.test.ts tests/command-runner.test.ts tests/history.test.ts`

Expected: FAIL because the frozen checkout does not verify `HEAD`, disable every protocol/config surface, or plan the previous scanned ancestor.

- [ ] **Step 3: Implement bounded command execution with typed timeout/output errors**

Use `spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] })`, kill the child tree on timeout, cap stdout and stderr independently, remove source-like text from error messages, and pass only the allowlisted runner variables plus explicit additions. Never concatenate a target path into a shell string.

- [ ] **Step 4: Implement exact checkout and verification**

Use `git init`, derive `https://github.com/{repository}.git` from the validated repository field, add the remote, fetch the requested SHA with `--no-tags --depth=20 --no-recurse-submodules`, detach with `core.hooksPath` set to the null device, then compare `git rev-parse HEAD` byte-for-byte to `target_sha`. Reject target-controlled canonical URL drift before invoking Git.

- [ ] **Step 5: Implement history planning**

`planHistory` must select the newest previously reported SHA for which `git merge-base --is-ancestor previous HEAD` succeeds. Return that SHA and `git diff --name-only -z previous..HEAD`; when none exists, return the files changed across the newest reachable 20 commits. Parse NUL-delimited paths and never shell-expand them.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/checkout.test.ts tests/command-runner.test.ts tests/history.test.ts && npm run typecheck`

Expected: PASS, including a path containing spaces, quotes, a leading dash, and shell metacharacters without command execution.

- [ ] **Step 7: Commit checkout hardening**

```bash
git add src/process src/git tests/checkout.test.ts tests/command-runner.test.ts tests/history.test.ts
git commit -m "feat(scan): harden exact commit checkout"
```

### Task 4: Build the Link-Safe Inventory, Classifier, and Archive Guard

**Files:**
- Modify: `src/inventory/inventory-handler.ts`
- Create: `src/inventory/classify.ts`
- Create: `src/inventory/archive-guards.ts`
- Modify: `tests/inventory.test.ts`
- Create: `tests/classify.test.ts`
- Create: `tests/archive-guards.test.ts`
- Create: `tests/fixtures/hostile-tree/README.md`

**Interfaces:**
- Produces: `Inventory`, `InventoryFile`, `InventoryTotals`, `classifyInventory(inventory)`, and `assertArchivePlan(entries, policy)`.
- `InventoryFile` contains metadata and hash; source bytes are read on demand and never stored in a public candidate.

- [ ] **Step 1: Add failing tests for symlinks, junctions, traversal, case collisions, Unicode controls, oversized files, and archive bombs**

```ts
expect(result).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_PATH" } });
expect(classification.modelEligible.map((file) => file.path)).toEqual(["src/index.ts"]);
expect(classification.applicability).toEqual({ osv: true, zizmor: true, malcontent: true });
expect(() => assertArchivePlan([{ path: "x", compressed: 1, expanded: 1000, depth: 5 }], policy)).toThrow(/archive ceiling/u);
```

- [ ] **Step 2: Run inventory tests and verify failure**

Run: `npm test -- tests/inventory.test.ts tests/classify.test.ts tests/archive-guards.test.ts`

Expected: FAIL because the frozen inventory silently skips links and keeps full text for every file without the approved classifications.

- [ ] **Step 3: Implement no-follow traversal and normalized path identity**

Reject links and reparse points rather than following them. Reject absolute, parent, NUL/control, invalid UTF-8, reserved-device, and case-fold-colliding portable paths. Count every regular file and byte before scanner or model work. Hash regular files incrementally.

- [ ] **Step 4: Implement first-party/model and scanner applicability classification**

Model-eligible files are regular first-party text that are not lockfiles, vendored dependencies, generated bundles, heavily minified content, raw archives, or binaries. OSV applies when supported manifest/lock names exist; zizmor applies only to `.github/workflows/*.{yml,yaml}` or `action.{yml,yaml}`; malcontent applies to binaries, executables, opaque files, or archives. Record excluded file and byte totals by category.

- [ ] **Step 5: Implement archive ceilings without executing extractors from the target**

Inspect archive tables through trusted libraries/adapters, normalize entry paths, reject links/traversal, and enforce the V1 depth, expanded-byte, and compression-ratio ceilings before malcontent receives an archive.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/inventory.test.ts tests/classify.test.ts tests/archive-guards.test.ts && npm run typecheck`

```bash
git add src/inventory tests/inventory.test.ts tests/classify.test.ts tests/archive-guards.test.ts tests/fixtures/hostile-tree
git commit -m "feat(scan): inventory hostile repositories safely"
```

### Task 5: Install and Verify the Pinned Scanner Toolchain

**Files:**
- Create: `scripts/install-scanners.mjs`
- Create: `scripts/verify-scanners.mjs`
- Modify: `package.json`
- Create: `tests/scanner-install.test.ts`

**Interfaces:**
- Produces CLI commands `npm run scanners:install` and `npm run scanners:verify`.
- Consumes `ScannerPins` from Task 2.

- [ ] **Step 1: Write failing URL/digest/version tests around an injected downloader and command runner**

```ts
expect(downloads).toEqual([
  expect.objectContaining({ name: "gitleaks", version: "8.30.1" }),
  expect.objectContaining({ name: "opengrep", version: "1.26.0" }),
  expect.objectContaining({ name: "osv-scanner", version: "2.4.0" }),
  expect.objectContaining({ name: "zizmor", version: "1.28.0" }),
]);
expect(() => verifyDigest(bytes, "0".repeat(64))).toThrow(/digest/u);
```

- [ ] **Step 2: Run the installer test and verify failure**

Run: `npm test -- tests/scanner-install.test.ts`

Expected: FAIL because no pinned installer exists.

- [ ] **Step 3: Implement release installation into a runner-temporary tool directory**

Download only the exact official release URLs represented by `config/scanners.v1.json`, stream-hash before extraction, reject archive traversal, and set executable bits after verification. Build malcontent from exact commit `790a3df22393eb9a9c43be78925a3aafee9e1fdb` with Go 1.26.5 and verify its embedded module version; do not use a floating tag or latest URL.

- [ ] **Step 4: Verify every executable reports the pinned version**

The verification command invokes only `--version`/equivalent in the tool directory with the restricted environment. Any missing, mismatched, or malformed tool is a system-wide failure.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/scanner-install.test.ts && npm run typecheck`

```bash
git add scripts/install-scanners.mjs scripts/verify-scanners.mjs package.json tests/scanner-install.test.ts
git commit -m "build(scan): pin deterministic scanner tools"
```

### Task 6: Implement Always-On Gitleaks and TavernKeeper OpenGrep Scanning

**Files:**
- Create: `src/scanners/types.ts`
- Create: `src/scanners/gitleaks.ts`
- Create: `src/scanners/opengrep.ts`
- Modify: `src/scanners/static-rules.ts`
- Create: `rules/opengrep/credential-exfiltration.yml`
- Create: `rules/opengrep/dynamic-execution.yml`
- Create: `rules/opengrep/install-and-persistence.yml`
- Create: `rules/opengrep/obfuscation.yml`
- Create: `tests/gitleaks.test.ts`
- Create: `tests/opengrep.test.ts`
- Modify: `tests/static-rules.test.ts`

**Interfaces:**
- Produces: `ScannerRun = { name, version, status: "completed" | "not-applicable", findings }`, `runGitleaks`, and `runOpenGrep`.
- Normalized findings use Task 1's confidence, category, redacted explanation, range, evidence SHA, and fingerprint contract.

- [ ] **Step 1: Write failing tests for tree/history invocations, redaction, malformed output, and stable fingerprints**

```ts
expect(calls.map(({ args }) => args[0])).toEqual(["dir", "git"]);
expect(JSON.stringify(run.findings)).not.toContain(seedSecret);
expect(run.findings[0]).toMatchObject({ origin: "gitleaks", confidence: "high" });
await expect(runOpenGrep(malformedInput)).rejects.toMatchObject({ code: "MALFORMED_SCANNER_OUTPUT" });
```

- [ ] **Step 2: Run focused scanner tests and verify failure**

Run: `npm test -- tests/gitleaks.test.ts tests/opengrep.test.ts tests/static-rules.test.ts`

Expected: FAIL because the frozen generic adapter neither performs separate history scanning nor uses TavernKeeper-owned OpenGrep rules.

- [ ] **Step 3: Implement Gitleaks tree and bounded-history adapters**

Run `gitleaks dir` against the current checkout and `gitleaks git` with log options limited to the planned history base/newest 20 commits. Force 100% redaction, write raw JSON only under the runner temporary directory, normalize it in memory, then delete it in `finally`.

- [ ] **Step 4: Implement the approved OpenGrep rules and adapter**

Rules must cover credential/environment/cookie/storage sources reaching network sinks, dynamic execution/interpreter spawning, encoded payload construction, network-capable installation hooks, persistence/startup modification, download-and-execute sequences, and host/user reconnaissance joined to transmission. Invoke only the committed `rules/opengrep` directory; never use `auto`, target config, or target ignore files.

- [ ] **Step 5: Preserve lightweight structural rules as a separate always-on stage**

Keep Unicode-bidirectional, suspicious manifest-hook, and cross-signal structural checks in `static-rules.ts`, but emit the canonical finding schema and never include the matched command or secret literal.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- tests/gitleaks.test.ts tests/opengrep.test.ts tests/static-rules.test.ts && npm run typecheck`

```bash
git add src/scanners rules/opengrep tests/gitleaks.test.ts tests/opengrep.test.ts tests/static-rules.test.ts
git commit -m "feat(scan): add required secret and code rules"
```

### Task 7: Implement Conditional OSV, zizmor, and malcontent Adapters

**Files:**
- Create: `src/scanners/osv.ts`
- Create: `src/scanners/zizmor.ts`
- Create: `src/scanners/malcontent.ts`
- Create: `src/scanners/run-scanners.ts`
- Replace: `src/scanners/external-tools.ts`
- Modify: `tests/external-tools.test.ts`
- Create: `tests/conditional-scanners.test.ts`

**Interfaces:**
- Produces: `runApplicableScanners({ root, history, classification, runner, policy }): Promise<ScannerRun[]>`.
- A non-applicable conditional tool returns `not-applicable`; unavailable, timeout, nonaccepted exit, and malformed output throw a classified scan error.

- [ ] **Step 1: Write the applicability and fail-closed tests**

```ts
expect(await runApplicableScanners(sourceOnly)).toEqual(expect.arrayContaining([
  expect.objectContaining({ name: "osv-scanner", status: "not-applicable" }),
  expect.objectContaining({ name: "zizmor", status: "not-applicable" }),
  expect.objectContaining({ name: "malcontent", status: "not-applicable" }),
]));
await expect(runApplicableScanners({ ...sourceOnly, classification: workflowTree })).rejects.toMatchObject({ code: "SCANNER_UNAVAILABLE", scope: "system" });
```

- [ ] **Step 2: Run the tests and verify the frozen adapter fails**

Run: `npm test -- tests/external-tools.test.ts tests/conditional-scanners.test.ts`

Expected: FAIL because the frozen adapter runs every tool, labels absence as unavailable output, and accepts OSV exit 128.

- [ ] **Step 3: Implement focused parsers and applicability**

OSV scans supported source manifests recursively without resolving/installing packages. zizmor receives only detected GitHub workflow/action paths. malcontent receives only bounded binary/archive/opaque paths and has container pulls plus registry credentials disabled. Each parser validates the tool's documented JSON shape before producing findings.

- [ ] **Step 4: Replace the generic adapter with the coordinator**

The coordinator always runs structural rules, Gitleaks, and OpenGrep; conditionally runs the other three; returns successful coverage only after every required invocation validates; and throws typed `repository` or `system` failures rather than constructing an incomplete report.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/external-tools.test.ts tests/conditional-scanners.test.ts && npm run typecheck`

```bash
git add src/scanners tests/external-tools.test.ts tests/conditional-scanners.test.ts
git commit -m "feat(scan): apply specialized security scanners"
```

### Task 8: Build the Complete Standard/Deep Model Corpus and Deterministic Chunker

**Files:**
- Create: `src/model/redaction.ts`
- Create: `src/model/corpus.ts`
- Create: `src/model/chunker.ts`
- Create: `tests/model-redaction.test.ts`
- Create: `tests/model-corpus.test.ts`
- Create: `tests/model-chunker.test.ts`

**Interfaces:**
- Produces: `selectModelCorpus({ mode, classification, changedPaths, findingPaths })`, `redactSource(source)`, and `chunkCorpus(files, policy)`.
- Every chunk has stable `id`, ordered path/range segments, redacted content, byte count, and content hashes.

- [ ] **Step 1: Write failing completeness and determinism tests**

```ts
expect(selectModelCorpus({ mode: "standard", classification, changedPaths: ["b.ts"], findingPaths: ["a.ts"] }).map(({ path }) => path)).toEqual(["a.ts", "b.ts"]);
expect(selectModelCorpus({ mode: "deep", classification, changedPaths: [], findingPaths: [] }).map(({ path }) => path)).toEqual(["a.ts", "b.ts", "README.md"]);
expect(chunkCorpus(files, policy)).toEqual(chunkCorpus([...files].reverse(), policy));
expect(chunkCorpus(files, policy).every((chunk) => chunk.bytes <= 524288)).toBe(true);
```

- [ ] **Step 2: Run corpus/chunker tests and verify failure**

Run: `npm test -- tests/model-redaction.test.ts tests/model-corpus.test.ts tests/model-chunker.test.ts`

Expected: FAIL because the frozen model layer truncates by aggregate file/character limits.

- [ ] **Step 3: Implement stable redaction and eligibility selection**

Replace secret-like literal values with deterministic markers such as `[REDACTED_SECRET:sha256-prefix]` while preserving newline count. Standard mode is the union of every eligible changed file and every eligible deterministic-finding path. Deep mode is every model-eligible first-party text file. No `slice(0, maxFiles)` or whole-repository input cap is permitted.

- [ ] **Step 4: Implement byte-bounded semantic chunking**

Sort by portable path, keep related manifest/entry-point/directory files together when they fit, split oversized files on syntax-neutral newline boundaries, include an 8192-byte bounded overlap, and assert that every selected path/range appears in at least one chunk. Chunk IDs hash ordered segment hashes plus model/prompt/scanner policy versions.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/model-redaction.test.ts tests/model-corpus.test.ts tests/model-chunker.test.ts && npm run typecheck`

```bash
git add src/model/redaction.ts src/model/corpus.ts src/model/chunker.ts tests/model-*.test.ts
git commit -m "feat(model): stream complete repository corpus"
```

### Task 9: Implement Required Configured-Model Review, Cache Resume, and Final Synthesis

**Files:**
- Create: `src/model/openai-compatible-client.ts`
- Create: `src/model/chunk-cache.ts`
- Create: `src/model/synthesis.ts`
- Rename: `src/model/minimax-review.ts` to `src/model/model-review.ts`
- Rename: `tests/minimax-review.test.ts` to `tests/model-review.test.ts`
- Create: `tests/model-cache.test.ts`
- Create: `tests/model-synthesis.test.ts`

**Interfaces:**
- Produces: `reviewWithConfiguredModel(spec): Promise<ModelReviewResult>` where success includes one validated result per chunk, final findings, and summed actual usage.
- Runtime configuration: exact full HTTPS endpoint + API key + model identifier from `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL`.
- Cache key: content hashes + endpoint origin + configured model identifier + prompt-policy version + scanner-policy version.

- [ ] **Step 1: Replace disabled/truncated tests with required all-chunk and resume tests**

```ts
expect(provider).toHaveBeenCalledTimes(chunks.length + 1);
expect(result.completedChunkIds).toEqual(chunks.map(({ id }) => id));
expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 300, cacheReadTokens: 400, reasoningTokens: 90 });
await expect(reviewWithConfiguredModel({ ...spec, apiKey: null })).rejects.toMatchObject({ code: "MODEL_CONFIGURATION", scope: "system" });
expect(secondRunProvider).toHaveBeenCalledTimes(uncachedChunks.length + 1);
```

- [ ] **Step 2: Run model tests and verify failure**

Run: `npm test -- tests/model-review.test.ts tests/model-cache.test.ts tests/model-synthesis.test.ts`

Expected: FAIL because the frozen code permits disabled/skipped model states and makes one capped request.

- [ ] **Step 3: Implement one strict chunk request**

POST to the configured endpoint exactly as supplied; do not append `/chat/completions`. Require HTTPS without user info, query, fragment, loopback/private destinations, or cross-origin redirects. Send the configured model identifier, temperature zero, the per-chunk output ceiling, JSON-object response mode, the hostile-data system instruction, normalized deterministic context, and redacted path/range segments. Parse only the assistant content field, never provider reasoning fields. Validate every returned path and line against the submitted segment ranges. Extract actual input/output and provider-returned cache/reasoning token categories after each response.

- [ ] **Step 4: Implement sanitized content-addressed cache records**

Cache only normalized findings, completion identity, and usage. Reject records containing source content, prompts, credentials, raw responses, or mismatched policy/model keys. A failed run leaves no public state; a later run starts at the first uncached chunk.

- [ ] **Step 5: Implement final synthesis without resending source**

The final call receives normalized deterministic/model findings and relationship metadata only. It may merge duplicates and add explanations but cannot remove deterministic findings, reduce their severity, change their evidence identity, or claim safety/coverage. Validate the final set and recompute fingerprints/result locally.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- tests/model-review.test.ts tests/model-cache.test.ts tests/model-synthesis.test.ts && npm run typecheck`

```bash
git add src/model tests/model-review.test.ts tests/model-cache.test.ts tests/model-synthesis.test.ts
git commit -m "feat(model): require complete model review"
```

### Task 10: Make Repository Scans Atomic and Complete

**Files:**
- Replace: `src/orchestrator/scan-handler.ts`
- Modify: `tests/scan-handler.test.ts`
- Create: `tests/scan-atomicity.test.ts`

**Interfaces:**
- Produces: `scanRepository(spec, dependencies): Promise<Result<SanitizedCandidate, ScanFailure>>`.
- A successful candidate conforms to `ScanReportSchema`; every failure returns no report value.

- [ ] **Step 1: Write failing atomicity tests**

```ts
for (const failure of [missingTool, malformedTool, modelQuota, invalidModel, unsafeCandidate]) {
  const result = await scanRepository(baseSpec, failure.dependencies);
  expect(result).toEqual(expect.objectContaining({ ok: false }));
  expect("value" in result).toBe(false);
}
expect((await scanRepository(baseSpec, completeDependencies))).toMatchObject({
  ok: true,
  value: { report: { result: "green", coverage: { model: { status: "completed" } } } },
});
```

- [ ] **Step 2: Run orchestration tests and verify failure**

Run: `npm test -- tests/scan-handler.test.ts tests/scan-atomicity.test.ts`

Expected: FAIL because the frozen handler returns public incomplete reports and converts model errors into findings-free coverage.

- [ ] **Step 3: Implement the ordered atomic pipeline**

Execute inventory, history planning, deterministic scanning, corpus selection, configured-model review, synthesis, finding normalization, coverage aggregation, result derivation, and candidate sanitation. Return immediately on any required failure. Put checkout/raw-output cleanup in `finally` and never include an incomplete report in a result union.

- [ ] **Step 4: Classify repository versus system failures**

Repository scope includes unavailable SHA, repository security ceiling, repository-specific parser input, and repeatedly invalid model output for one target. System scope includes a missing/broken required tool, configured-model authentication/quota/provider outage, contract mismatch, publisher defect, and Pages failure.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/scan-handler.test.ts tests/scan-atomicity.test.ts && npm run typecheck`

```bash
git add src/orchestrator/scan-handler.ts tests/scan-handler.test.ts tests/scan-atomicity.test.ts
git commit -m "feat(scan): publish only complete scan candidates"
```

### Task 11: Implement the Derived Backlog, Retry State, and Circuit Breaker

**Files:**
- Create: `src/queue/backlog.ts`
- Create: `src/operations/state.ts`
- Create: `src/operations/retry.ts`
- Create: `src/operations/telemetry.ts`
- Create: `operations/state.json`
- Create: `tests/backlog.test.ts`
- Create: `tests/operations-state.test.ts`
- Create: `tests/retry.test.ts`
- Create: `tests/telemetry.test.ts`

**Interfaces:**
- Produces: `planBatch(manifest, index, state, now): BatchPlan`, `recordFailure`, `recordSuccess`, `dueRetries`, `pauseSystem`, and `resumeSystem`.
- `BatchPlan.targets.length <= 5`; workflow matrix enforces maximum parallel two.

- [ ] **Step 1: Write failing coalescing, priority, age, retry, and breaker tests**

```ts
expect(plan.targets).toHaveLength(5);
expect(new Set(plan.targets.map(({ repository_id }) => repository_id)).size).toBe(5);
expect(plan.targets[0].reason).toBe("new");
expect(dueRetries(state, addHours(initial, 2)).map(({ attempt }) => attempt)).toEqual([2]);
expect(planBatch(manifest, index, systemPausedState, now).targets).toEqual([]);
expect(buildTelemetry(run).model.usage.inputTokens).toBe(1200);
expect(allowanceWarnings({ used: 45_000_000, allowance: 60_000_000 })).toEqual([75]);
```

- [ ] **Step 2: Run queue/operations tests and verify failure**

Run: `npm test -- tests/backlog.test.ts tests/operations-state.test.ts tests/retry.test.ts tests/telemetry.test.ts`

Expected: FAIL because queue and retry modules do not exist.

- [ ] **Step 3: Implement derived backlog and priority**

Compute manifest targets minus complete preferred reports for the current SHA/policy. Coalesce repository ID to the newest manifest SHA. Sort newly listed, changed SHA, due retry, then staff policy campaign; apply monotonic age boost without overtaking a due system recovery. Deep scans use a distinct staff lane but share the global two-job limit.

- [ ] **Step 4: Implement secret-free operational state**

`operations/state.json` contains schema version, pause state, retry entries with target identity/error fingerprint/scope/initial failure/attempt/next time, and policy campaigns. It contains no source, findings, provider body, raw errors, or credentials. Serialize keys and entries deterministically.

- [ ] **Step 5: Implement exact retry and notification transitions**

Schedule attempts at initial time plus one, two, and three hours. Intermediate attempts keep the orchestration workflow successful and open no issue. Success removes the retry silently and releases a transient system breaker. Failure at attempt three marks exhaustion, leaves a system-wide breaker engaged until TavernKeeper staff explicitly resume, and only then may the workflow fail visibly and open/update one `scanner-operations` issue. Credential compromise bypasses delay.

- [ ] **Step 6: Implement secret-free telemetry and allowance warnings**

Record desired/pending/active/completed/retrying/blocked/superseded counts, oldest pending age, batch throughput, per-scanner applicability/runtime, actual configured-model input/output/cache-read/reasoning usage, cache hits/misses, retry class/attempt, report commit, Pages verification, wake timestamps, and contract/scanner/prompt/policy versions. Emit 50%, 75%, and 90% allowance warnings only when reliable usage/allowance data exists; never impose a lower cutoff. Exclude target source, raw errors, provider bodies, credentials, and secret-shaped values.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- tests/backlog.test.ts tests/operations-state.test.ts tests/retry.test.ts tests/telemetry.test.ts && npm run typecheck`

```bash
git add src/queue src/operations operations/state.json tests/backlog.test.ts tests/operations-state.test.ts tests/retry.test.ts tests/telemetry.test.ts
git commit -m "feat(queue): drain bounded retry-aware batches"
```

### Task 12: Publish Immutable Sanitized Reports and Static HTML

**Files:**
- Create: `src/publish/sanitize.ts`
- Create: `src/publish/report-path.ts`
- Create: `src/publish/render-report.ts`
- Create: `src/publish/publisher.ts`
- Create: `src/site/build-site.ts`
- Create: `reports/index.json`
- Create: `tests/report-path.test.ts`
- Create: `tests/report-sanitize.test.ts`
- Create: `tests/report-render.test.ts`
- Create: `tests/publisher.test.ts`

**Interfaces:**
- Produces: `reportIdentity`, `reportPath`, `sanitizeCandidate`, `renderReportHtml`, `publishCandidates`, and `buildSite`.
- Immutable path: `reports/github/{repository-id}/{sha}/{policy-version}/{mode}/{report-version}/`.

- [ ] **Step 1: Write failing identity, immutability, redaction, HTML, and preferred-index tests**

```ts
expect(reportPath(report)).toBe(`reports/github/42/${sha}/1/standard/1`);
await expect(publishCandidates([report], existingPath)).rejects.toThrow(/immutable path exists/u);
expect(() => sanitizeCandidate(secretBearingReport)).toThrow(/secret-shaped/u);
expect(renderReportHtml(hostileReport)).not.toContain("<script");
expect(selectPreferred([standard, deep, adjudicated]).report_id).toBe(adjudicated.report_id);
```

- [ ] **Step 2: Run publisher tests and verify failure**

Run: `npm test -- tests/report-path.test.ts tests/report-sanitize.test.ts tests/report-render.test.ts tests/publisher.test.ts`

Expected: FAIL because publication modules do not exist.

- [ ] **Step 3: Implement stable identities and sanitation**

Hash the canonical identity fields to derive `report_id`. Reject raw-secret patterns, source-shaped excerpts, control characters, nonapproved URLs, local paths, unknown fields, result/count mismatches, and any existing destination. Only rule-documentation, canonical GitHub repository/commit, Tavernary, and same-origin immutable report URLs are allowed.

- [ ] **Step 4: Render static script-free report pages**

Escape every repository-controlled value. Emit a restrictive CSP meta tag, no scripts, no remote images, and sections for identity, advisory result, coverage, exclusions, usage, and sanitized findings. Include the explicit statement that green is not a safety certification.

- [ ] **Step 5: Implement a serialized filesystem transaction and deterministic index**

Stage validated JSON/HTML plus `operations/state.json` in a temporary directory, refuse overwrites, atomically move new paths, rebuild `reports/index.json` with preferred entries for current and historical SHAs, then build a Pages staging directory containing reports, schemas, rule docs, and no scanner source.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- tests/report-path.test.ts tests/report-sanitize.test.ts tests/report-render.test.ts tests/publisher.test.ts && npm run typecheck`

```bash
git add src/publish src/site reports/index.json tests/report-*.test.ts tests/publisher.test.ts
git commit -m "feat(reports): publish immutable sanitized results"
```

### Task 13: Implement Staff Adjudication and the Non-Scanning Appeal Surface

**Files:**
- Create: `src/adjudication/adjudicate.ts`
- Create: `rules/dismissals.json`
- Create: `.github/ISSUE_TEMPLATE/false-positive.yml`
- Create: `tests/adjudication.test.ts`
- Create: `tests/appeal-template.test.ts`

**Interfaces:**
- Produces: `adjudicateFinding({ report, fingerprint, decision, rationale, actor, completedAt })`.
- An accepted dismissal returns a new immutable report version that supersedes the prior report; it never modifies the old report.

- [ ] **Step 1: Write failing immutable-adjudication and appeal-safety tests**

```ts
expect(next.supersedes_report_id).toBe(original.report_id);
expect(next.report_version).toBe(original.report_version + 1);
expect(next.findings.find(({ fingerprint }) => fingerprint === appealed)?.disposition).toBe("dismissed");
expect(appealWorkflowText).not.toMatch(/workflow_dispatch|repository_dispatch|scan/u);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/adjudication.test.ts tests/appeal-template.test.ts`

Expected: FAIL because adjudication and appeal files do not exist.

- [ ] **Step 3: Implement staff adjudication**

Require exact report ID and finding fingerprint, preserve all evidence fields, add staff actor/time/rationale metadata, recompute counts/result, increment report version, and publish through the normal sanitizer/publisher. Add a reusable dismissal to `rules/dismissals.json` only when staff explicitly marks it reusable.

- [ ] **Step 4: Create a GitHub Issue Form that cannot trigger work**

Collect immutable report URL, report ID, finding fingerprint, maintainer relationship, and explanation. State that submission does not rescan, change Tavernary, hide a finding, or guarantee acceptance. Do not add an issue-event workflow.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/adjudication.test.ts tests/appeal-template.test.ts && npm run typecheck`

```bash
git add src/adjudication rules/dismissals.json .github/ISSUE_TEMPLATE tests/adjudication.test.ts tests/appeal-template.test.ts
git commit -m "feat(reports): add immutable staff adjudication"
```

### Task 14: Add CLIs and Secure GitHub Actions Orchestration

**Files:**
- Create: `src/cli/reconcile.ts`
- Create: `src/cli/prepare-target.ts`
- Create: `src/cli/review-target.ts`
- Create: `src/cli/finalize-target.ts`
- Create: `src/cli/publish.ts`
- Create: `src/cli/retry.ts`
- Create: `src/cli/deep-scan.ts`
- Create: `src/cli/policy-rescan.ts`
- Create: `src/cli/adjudicate.ts`
- Create: `src/cli/build-site.ts`
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/reconcile.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `.github/workflows/retry.yml`
- Create: `.github/workflows/deep-scan.yml`
- Create: `.github/workflows/policy-rescan.yml`
- Create: `.github/workflows/adjudicate.yml`
- Create: `tests/cli.test.ts`
- Create: `tests/workflows.test.ts`

**Interfaces:**
- Reconcile writes a JSON matrix with at most five targets; Actions sets `strategy.max-parallel: 2`.
- Each scan job uses prepare, model-review, and finalize steps; only the model-review step receives `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL`.
- Scan jobs upload sanitized candidate/state-transition artifacts only.
- Publisher alone receives `contents: write`; scan jobs receive no repository write token.

- [ ] **Step 1: Write failing CLI/workflow policy tests**

```ts
expect(matrix.include.length).toBeLessThanOrEqual(5);
expect(reconcile.on.schedule).toEqual([{ cron: "13 */6 * * *" }]);
expect(reconcile.on.workflow_dispatch).toBeNull();
expect(reconcile.jobs.scan.strategy["max-parallel"]).toBe(2);
expect(reconcile.jobs.scan.permissions.contents).toBe("read");
expect(reconcile.jobs.publish.permissions.contents).toBe("write");
expect(JSON.stringify(reconcile.on)).not.toMatch(/issue_comment|issues|pull_request_target/u);
expect(retry.on.schedule).toEqual([{ cron: "17 * * * *" }]);
```

- [ ] **Step 2: Run CLI/workflow tests and verify failure**

Run: `npm test -- tests/cli.test.ts tests/workflows.test.ts`

Expected: FAIL because CLIs and workflows do not exist.

- [ ] **Step 3: Implement JSON-only CLIs**

Every CLI validates file/env input, writes machine output to stdout, diagnostics to stderr without source/error bodies, and exits nonzero only for terminal/exhausted failure. `prepare-target` performs checkout, inventory, history, deterministic scanners, corpus selection, and chunk planning with no provider credentials. `review-target` refetches Tavernary's public manifest immediately before configured-model work; if the queued SHA is obsolete it emits an obsolete transition and spends no model tokens, otherwise it processes the planned chunks and receives the three `TAVERNKEEPER_*` model settings only in that step. `finalize-target` receives no provider credentials, verifies complete chunk coverage, synthesizes/normalizes, sanitizes the candidate, and deletes the ephemeral session in `finally`.

- [ ] **Step 4: Implement `reconcile.yml`**

Triggers: `schedule: 13 */6 * * *`, input-free `workflow_dispatch`, and internal input-free continuation. Fetch targets only from `https://tavernary.org/security/tavernkeeper-targets.json`. Plan on trusted `main`, create at most five matrix entries, scan with maximum parallel two, restore/save only the sanitized model cache, upload sanitized candidates, serialize publication, push reports/state to `main`, and invoke the reusable exact-SHA Pages workflow. If any matrix result carries a system-wide failure, the serialized publisher commits only the operational breaker transition and publishes none of that operation's otherwise successful report candidates.

Use these full Action SHAs:

```yaml
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16
actions/cache@caa296126883cff596d87d8935842f9db880ef25
actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093
actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d
actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9
actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128
actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349
```

- [ ] **Step 5: Implement retry and protected staff workflows**

`retry.yml` runs hourly and dispatches only due automatic retries. Deep, policy, and adjudication workflows use input validation, `environment: tavernkeeper-staff`, no public event trigger, and the same global scan concurrency. Manual retry/pause/resume are input choices on a staff workflow and cannot accept a clone URL, token budget, model, or arbitrary command.

Automatic scan jobs use `environment: tavernkeeper-scanner`, restricted to protected `main` without required reviewers. Manual deep/policy/oversized scans use `environment: tavernkeeper-staff` with required reviewers. Configure `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL` for both paths and expose them only on the configured-model request step; scanner subprocess steps receive no provider credentials. The release values are NanoGPT's appropriate full Chat Completions endpoint and `deepseek/deepseek-v4-flash`, but workflows never hard-code either value.

- [ ] **Step 6: Implement reusable exact-SHA Pages deployment and Tavernary wake**

`deploy-pages.yml` supports trusted `workflow_call` and staff `workflow_dispatch`. It validates that `source_sha` is a full commit and ancestor of `origin/main`, checks out detached, builds the Pages staging directory, deploys it, polls `https://mentallyquill.github.io/TavernKeeper/reports/index.json` until the expected digest is live, then uses the TavernKeeper-to-Tavernary App to dispatch Tavernary's input-free import workflow. The payload contains no report URL, target, SHA instruction, mode, priority, or budget. Wake failure becomes a warning after valid publication. A Pages build/deploy/verification failure is a system-wide failure routed through the same retry/circuit-breaker policy.

- [ ] **Step 7: Implement issue notification only after retry exhaustion**

At terminal exhaustion, use the repository-local token with `issues: write` to create/update one issue labeled `scanner-operations`, deduplicated by error fingerprint and scope. Do not mention or contact external repository owners. Intermediate runs must not fail the top-level workflow.

- [ ] **Step 8: Run tests and commit**

Run: `npm test -- tests/cli.test.ts tests/workflows.test.ts && npm run typecheck`

```bash
git add src/cli .github/workflows package.json tests/cli.test.ts tests/workflows.test.ts
git commit -m "feat(ops): orchestrate bounded secure scans"
```

### Task 15: Add Hostile End-to-End Fixtures, Documentation, and Release Gates

**Files:**
- Create: `tests/fixtures/benign-small/**`
- Create: `tests/fixtures/malicious-signals/**`
- Create: `tests/fixtures/booby-trapped/**`
- Create: `tests/fixtures/oversized-policy/**`
- Create: `tests/e2e/scan-fixtures.test.ts`
- Create: `tests/e2e/publication.test.ts`
- Create: `scripts/check-workflow-policy.mjs`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `docs/architecture.md`
- Create: `docs/operations.md`
- Create: `docs/rules.md`
- Create: `LICENSE`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run check`, `npm run test:e2e`, and `npm run workflows:check` release gates.

- [ ] **Step 1: Write hostile fixture tests before fixture behavior exists**

The booby-trapped fixture includes Git hooks, package lifecycle scripts, workflow commands, shell scripts, binaries, traversal archives, Unicode controls, prompt injection, and seeded fake secrets. Tests assert that no marker file or network test double is touched and no seeded secret appears in logs, cache, report JSON, or HTML.

- [ ] **Step 2: Run end-to-end tests and verify failure**

Run: `npm run test:e2e`

Expected: FAIL until fixtures, complete pipeline wiring, publication, and zero-execution assertions exist.

- [ ] **Step 3: Implement fixture harnesses and release checks**

Run exact checkout/inventory/scanners/model doubles/publisher against each fixture. Prove green, yellow, repository failure, system breaker, retry recovery, immutable collision, and redaction behavior. Add a workflow checker that rejects mutable `uses:` refs, excessive permissions, public scan triggers, matrix parallelism above two, and batch sizes above five.

- [ ] **Step 4: Write operator and public documentation**

Document advisory semantics, scanner coverage, exact-SHA identity, green/yellow meaning, no-execution boundary, public-report limitations, appeals, staff pause/retry/resume/deep/policy/adjudication procedures, configured-model quota recovery, oversized repository procedure, credentials, two GitHub Apps, Pages recovery, and AGPL/third-party licensing. Document that reports are retained indefinitely and immutable; a legal or credential-exposure removal is a separately approved, audited incident that must address both Pages and Git history rather than a normal publisher feature.

- [ ] **Step 5: Add the complete check script and run every local gate**

```json
{
  "scripts": {
    "check": "npm run format:check && npm run typecheck && npm test && npm run workflows:check",
    "test:e2e": "vitest run tests/e2e",
    "workflows:check": "node scripts/check-workflow-policy.mjs"
  }
}
```

Run: `npm run check && npm run test:e2e && npm run build`

Expected: PASS with zero failed tests, no workflow-policy violation, and no generated public report from a failed fixture.

- [ ] **Step 6: Commit the release-ready TavernKeeper implementation**

```bash
git add tests/fixtures tests/e2e scripts/check-workflow-policy.mjs README.md SECURITY.md docs LICENSE package.json
git commit -m "docs: certify TavernKeeper V1 operations"
```

---

## TavernKeeper Completion Evidence

Before handing TavernKeeper to the cross-repository rollout plan, capture:

1. `git status --short` is empty.
2. `npm run check` passes.
3. `npm run test:e2e` passes with the booby-trapped fixture proving zero execution.
4. `npm run build` passes.
5. Workflow policy confirms five-target batches, maximum parallel two, exact Action SHAs, job-local permissions, and no public scan trigger.
6. A failed required scanner or configured-model call produces no report candidate.
7. A successful fixture report validates against both JSON Schemas, contains no seeded secret/source excerpt, and renders as script-free HTML.
8. `operations/state.json` contains no source, raw error, provider body, or credential material.
9. The branch contains no generated report branch, server, database, fallback model, aggregate token cap, or Codeberg scanning path.
