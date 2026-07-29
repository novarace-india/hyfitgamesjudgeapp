# Two-Stage Check-In Implementation Plan

Date: 29 July 2026

Design: `docs/superpowers/specs/2026-07-29-two-stage-checkin-identity-assets-design.md`

## Delivery strategy

Implement the feature in vertical, testable slices. Preserve legacy check-in
evidence, keep the current Judge and Timing apps unaffected, and retain the
local-first RaceResult delivery model.

## Task 1: Extend the database safely

Create a forward-only migration for:

- counter `stage_type`;
- participant `gender`, `date_of_birth`, and `club`;
- event-level photo/signature/declaration/retention settings;
- immutable Stage 1 and Stage 2 transaction records;
- identity exceptions and Admin resolutions;
- media metadata and media-access audit references;
- independent stage state and unique idempotency constraints;
- asset and stage indexes required for fast BIB lookup.

Preserve existing `checkins` and `asset_assignments`. Mark them as legacy in
queries rather than converting them into fabricated stage evidence.

Add migration tests for constraints, uniqueness, and repeat-safe application.

## Task 2: Extend participant import and Doubles grouping

Update the normalized participant contract and import pipeline to support:

- `Gender`;
- `DateOfBirth`;
- `club`;
- configurable nested paths and tolerant aliases;
- valid date normalization without silently inventing dates.

Persist the fields during Admin roster sync. Add a focused team-grouping module
that groups exactly two athletes only within the same Doubles contest and club.
Return warning metadata for missing, single, oversized, or inconsistent groups.

Extend unit tests for mappings, imports, updates, and all team-grouping cases.

## Task 3: Add stage-aware counter configuration

Extend counter creation and editing APIs to accept only:

- `STAGE_1_WRISTBAND`;
- `STAGE_2_TRANSPONDER`.

Block stage-type changes while active volunteer assignments exist. Include the
stage type in authenticated Check-In context and Admin overview responses.
Record every create/change action in the audit log.

Update Admin tests for role checks, validation, assignment behavior, and audit
snapshots.

## Task 4: Add event Check-In policy controls

Extend the published event configuration with:

- `requireParticipantPhoto`, default `false`;
- `requireDeclaratorySignature`, default `false`;
- versioned declaration text;
- `mediaRetentionDays`, default `30`.

Expose plain Admin controls rather than requiring raw JSON edits. Validate
retention bounds and preserve each declaration version referenced by an
accepted Stage 1 transaction.

Add configuration tests covering defaults, versioning, authorization, and
invalid retention values.

## Task 5: Build participant and stage lookup

Replace the current minimal Check-In participant response with a stage-aware
view model containing:

- complete identity fields;
- Doubles teammate identity and independent progress;
- active wristband/transponder assignments;
- Stage 1 and Stage 2 receipts and sync states;
- team-data warnings;
- the current counter's permitted action.

Ensure the server scopes every lookup to the authenticated event. Never expose
historical photo/signature URLs in the student response.

Add API tests for singles, Doubles, missing data, completed stages, pending sync,
and cross-event isolation.

## Task 6: Implement secure optional media capture

Add transaction-bound upload endpoints for participant photos and signatures.
Validate:

- authenticated role and active Stage 1 counter;
- MIME type, byte limit, image dimensions, and transaction ownership;
- checksum and media type;
- non-public server storage path.

Store server timestamp, event, participant, BIB, transaction, checksum, size,
and dimensions. Provide Admin-only retrieval that logs every view/download.
Implement retention cleanup using the event end plus configured retention days,
including deletion audit events.

Add tests for unauthorized access, malformed files, size limits, transaction
binding, audited retrieval, and retention deletion. Document the required
persistent media volume and backup-retention configuration.

## Task 7: Implement Stage 1 completion

Create a dedicated idempotent Stage 1 endpoint that:

1. derives event, volunteer, counter, session, device, IP, and timezone from
   authenticated state;
2. validates a Stage 1 counter assignment;
3. locks the participant and wristband assignment;
4. requires Government-ID verification;
5. enforces configured photo/signature evidence;
6. stores declaration text/version and audit snapshots;
7. assigns the wristband;
8. commits the immutable local receipt;
9. creates three RaceResult operations;
10. immediately attempts delivery after commit.

Default RaceResult operations:

- `stage1checkin = COMPLETED`;
- `stage1checkintime = YYYY-MM-DD HH:mm:ss`;
- `wristbandID = <scanned code>`.

Return local receipt and per-stage synchronization state without waiting for a
successful RaceResult response.

Add tests for evidence requirements, uniqueness, idempotency, exact field
casing/value/timezone, immediate success, connectivity failure, and retries.

## Task 8: Implement Stage 2 completion

Create a dedicated idempotent Stage 2 endpoint that:

1. validates a Stage 2 counter assignment;
2. locks the participant and transponder assignment;
3. requires authoritative local Stage 1 completion;
4. records the Stage 1 receipt snapshot used during handover;
5. assigns `Transponder1`;
6. commits the immutable Stage 2 receipt;
7. creates and immediately attempts three RaceResult operations.

Default operations:

- `stage2checkin = COMPLETED`;
- `stage2checkintime = YYYY-MM-DD HH:mm:ss`;
- `Transponder1 = <scanned code>`.

Add tests for stage ordering, pending Stage 1 RaceResult sync, asset conflicts,
idempotency, exact fields, immediate delivery, and partial external failure.

## Task 9: Implement Help Desk and replacement controls

Add student identity-exception creation with a constrained reason list and
optional note. Add Admin-only:

- exception review;
- reason-required override or rejection;
- required-evidence waiver;
- wristband/transponder replacement with linked prior assignment.

Never modify the original exception or assignment. Append resolution and
replacement evidence and audit events.

Add authorization, history, and concurrency tests.

## Task 10: Rebuild the student Check-In experience

Use the approved visual hierarchy:

- prominent assigned stage;
- scan-first empty state with manual fallback;
- complete participant identity card;
- visually separate Doubles teammate card;
- one large primary action at a time;
- smaller Help Desk action;
- full-screen success receipt and **Next athlete**;
- clear local/RaceResult status labels that do not rely on colour.

Stage 1 flow:

- ID verification;
- declaration acceptance;
- optional signature canvas;
- optional photo camera with front/rear/retry;
- wristband scan;
- review and complete.

Stage 2 flow:

- identity and Stage 1 receipt review;
- transponder scan;
- review and complete.

Preserve large controls on tablet and mobile, sticky mobile actions, minimum
56px targets, readable labels, safe reset behavior, and disabled states that
explain the next action.

## Task 11: Upgrade Admin UI and operational visibility

Add polished controls for:

- counter stage type;
- photo/signature switches;
- declaration text and retention;
- participant Stage 1/Stage 2 progress;
- separate RaceResult sync status;
- Help Desk exceptions and asset replacement;
- authorized media review.

Make dangerous or privacy-sensitive actions visually distinct and confirmation
protected.

## Task 12: Migration and compatibility cleanup

Retire the combined Check-In submission path from the UI while leaving its
historical APIs/data readable for legacy audit. Update default update mappings
from the old combined fields to the six new stage fields without overwriting an
administrator's explicit custom mappings.

Update the local race-day runbook with:

- Stage 1/Stage 2 counter setup;
- volunteer assignments;
- exact RaceResult fields;
- photo/signature storage;
- sync-pending behavior;
- Help Desk and replacement procedures;
- media cleanup verification.

## Task 13: End-to-end verification

Run:

- lint;
- full unit and integration suite;
- migration application against a clean and existing local database;
- production build;
- authenticated Stage 1 and Stage 2 API smoke tests;
- immediate RaceResult delivery checks with a controlled stub;
- disconnected-internet retry test;
- tablet and mobile responsive review;
- camera, QR, manual entry, signature, and optional-feature testing;
- cross-role and cross-event authorization checks;
- `git diff --check`.

Seed a small local roster containing singles, a valid Doubles team, incomplete
team data, and existing asset assignments for repeatable testing.

## Completion criteria

The implementation is complete when two separately assigned student volunteers
can process the same athlete through Stage 1 and Stage 2, each stage is locally
auditable and independently synchronized through the exact six RaceResult
fields, identity and Doubles information is complete, optional media behaves
according to Admin settings, failure paths are safe, and all automated and
local end-to-end checks pass.
