# Doubles Team Judge Flow Implementation Plan

Date: 30 July 2026

Design: `docs/superpowers/specs/2026-07-30-doubles-team-judge-flow-design.md`

## Delivery strategy

Preserve the current Singles request and response paths. Add explicit Doubles
team behavior only for ContestIDs 9, 10, 11, and 12. Store one authoritative
race session and shared race evidence, link both participants to it, and fan
RaceResult operations out to both individual BIBs.

## Task 1: Shared Doubles domain rules

Add a focused module defining the authoritative Doubles ContestIDs, normalized
team-key rules, teammate validation, scan-state validation, and display
identity. Unit test every ContestID and malformed-team case.

## Task 2: Forward-only team-session migration

Add session mode/team snapshot fields and a race-session participant link table.
Backfill existing sessions as Singles links without changing their evidence.
Enforce one active session per participant across Singles and Doubles and
exactly two distinct participant links through transactional API validation.

## Task 3: Pair resolution and atomic claim

Extend wristband resolution with server-derived teammate/check-in metadata.
Keep the current Singles claim body compatible. Add a Doubles claim body
containing two scanned wristband codes and explicit readiness confirmation.
Validate both active wristbands, team identity, Stage 2 completion, and
availability in one transaction; create and lock one team session atomically.

## Task 4: Shared timing snapshots and delivery fan-out

Return a discriminated Singles/Doubles identity from timing snapshots. Continue
storing one set of splits, station outcomes, cognitive evidence, and
first-start/last-finish timing on the session. Change outbox creation to target
every participant linked to the session while retaining one target for Singles.
Expose per-BIB aggregated delivery state.

## Task 5: Doubles Judge pairing and race UI

For ContestIDs 9–12, guide the judge through first wristband, expected teammate,
second wristband, and explicit both-ready confirmation. Display both names and
BIBs throughout the shared timing and completion experience. Retain the
existing single-athlete screens and copy for all other contests.

## Task 6: Recovery, cancellation, and diagnostics

Ensure active-session lookup treats either partner as belonging to the shared
session. Make duplicate/wrong/missing-stage scans actionable. Preserve
idempotent recovery and show confirmed, partial/pending, and attention delivery
states without reopening completed local results.

## Task 7: Verification

Add unit and source-contract tests for Doubles rules, scan order, malformed
teams, Stage 2 gating, atomic locks, shared timing/cognitive evidence, two-BIB
fan-out, partial delivery, and Singles isolation. Run lint, direct Node tests,
the production build available on this host, migration checks, and authenticated
local smoke tests when PostgreSQL is available.
