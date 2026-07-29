# Project Submission Short Description Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Tavernary's 220-character catalog summary limit in the project submission form and manifest boundary, with a live character counter.

**Architecture:** Keep the browser experience and manifest validation independent. The React builder prevents input beyond 220 characters and exposes the current count, while `normalizeProjectSubmissionManifest` rejects overlong normalized values from any caller.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- The maximum Short Description length is exactly 220 characters.
- The counter copy is exactly `x/220 characters`.
- The manifest error is exactly `Short Description must be 220 characters or fewer.`
- Existing helper copy, required/optional behavior, whitespace normalization, emoji sanitation, and inline error routing remain unchanged.

---

### Task 1: Manifest validation boundary

**Files:**
- Modify: `tests/unit/project-submission-manifest.test.ts`
- Modify: `src/features/submissions/project-submission-manifest.mjs`

**Interfaces:**
- Consumes: `normalizeProjectSubmissionManifest(value)`
- Produces: acceptance at 220 normalized characters and rejection at 221 normalized characters

- [x] **Step 1: Write failing boundary tests**
- [x] **Step 2: Run `npm.cmd test -- tests/unit/project-submission-manifest.test.ts` and verify RED**
- [x] **Step 3: Reject normalized descriptions longer than 220 characters**
- [x] **Step 4: Rerun the manifest tests and verify GREEN**

### Task 2: Form cap and live counter

**Files:**
- Modify: `tests/unit/project-submission-builder.test.tsx`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`

**Interfaces:**
- Consumes: the builder's existing `description` React state
- Produces: textarea `maxLength={220}` and visible `${description.length}/220 characters`

- [x] **Step 1: Write a failing form behavior test**
- [x] **Step 2: Run `npm.cmd test -- tests/unit/project-submission-builder.test.tsx` and verify RED**
- [x] **Step 3: Add the native cap, counter, and accessible description association**
- [x] **Step 4: Rerun the builder tests and verify GREEN**

### Task 3: Full verification

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes: completed form and manifest changes
- Produces: repository-wide evidence that formatting, linting, types, tests, build, and static export remain valid

- [x] **Step 1: Run both focused test files together**
- [x] **Step 2: Run `npm.cmd run check`**
- [x] **Step 3: Run `git diff --check` and inspect the final diff**
