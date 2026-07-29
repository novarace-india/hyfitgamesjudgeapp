# Two-Stage Check-In, Identity Verification, and Asset Handover Design

Date: 29 July 2026

Status: Approved design, pending written-spec review

## Objective

Split HYFIT athlete check-in into two independently operated physical stages:

1. **Stage 1 · Check-In and Wristband** verifies the athlete against a
   Government ID and assigns a wristband.
2. **Stage 2 · Arena Transponder** confirms Stage 1 completion and assigns the
   athlete's transponder.

The experience must be safe for tenth-grade student volunteers, quick on
tablets and phones, locally reliable, fully auditable, and immediately
synchronized to RaceResult without making the volunteer wait for RaceResult.

## Core operating model

The existing Check-In app remains one application. Every check-in counter is
configured by an Event Admin as exactly one of:

- `STAGE_1_WRISTBAND`
- `STAGE_2_TRANSPONDER`

The authenticated volunteer's active counter assignment determines the screen
and permitted actions. Volunteers cannot switch stages from the operational
screen. This prevents a busy student operator from accidentally recording the
wrong handover.

Each athlete remains an individual RaceResult participant with an individual
BIB, QR code, wristband, transponder, check-in history, and timing record.
Doubles membership affects display context only; it never combines the
individual operational records.

## Participant data and Doubles teams

The participant import is extended to normalize and retain:

- Full Name
- Gender, sourced by default from `Gender`
- Date of Birth, sourced by default from `DateOfBirth`
- Contest/category
- Wave Time
- Club, sourced by default from `club`
- BIB and existing source identifiers/status

All source paths remain configurable through the Admin participant mapping.
The importer stores the normalized identity fields needed by Check-In while
preserving the source snapshot for audit and diagnostics.

For a Doubles contest, the app groups two individual participants only when
they have the same normalized, nonempty `club` value and the same contest.
Scanning either partner shows both athletes, their BIBs, and their independent
Stage 1 and Stage 2 progress. Asset assignment always applies only to the
scanned athlete.

Missing `club`, one unmatched partner, more than two matching participants, or
conflicting contest data displays **Team data needs attention**. This warning
does not block the scanned athlete's individual check-in. It is included in the
audit context and can be investigated at the Help Desk.

## Stage 1 workflow

The Stage 1 volunteer performs this guided sequence:

1. Scan the participant's numeric-BIB QR code or enter the BIB manually.
2. View Full Name, Gender, Date of Birth, Contest, Wave Time, and BIB.
3. For Doubles, also view both team members and each partner's current progress.
4. Compare the displayed identity with the athlete's Government ID.
5. Tap the mandatory large **Government ID verified** declaration.
6. Present the configured participant declaration.
7. If enabled for the event, capture the participant's declaratory signature.
8. If enabled for the event, capture a live photo of the participant.
9. Scan or manually enter the wristband ID.
10. Review the athlete, declaration evidence, and wristband.
11. Complete Stage 1.

Government ID numbers and Government ID images are never entered, uploaded, or
stored. The audit records only that the authenticated volunteer declared that
the identity was verified.

Completing Stage 1 commits the local handover atomically before attempting
RaceResult delivery. The app then shows a large receipt and immediately permits
the next athlete.

## Stage 2 workflow

The Stage 2 volunteer performs this guided sequence:

1. Scan the participant's numeric-BIB QR code or enter the BIB manually.
2. View the same identity and Doubles context used at Stage 1.
3. View the immutable Stage 1 receipt: completion time, counter, volunteer, and
   wristband ID.
4. Perform a quick visual identity cross-check.
5. Scan or manually enter `Transponder1`.
6. Review the athlete, wristband, and transponder.
7. Complete Stage 2.

Stage 2 is blocked when the local authoritative Stage 1 record does not exist.
RaceResult synchronization may still be pending; pending external delivery does
not block Stage 2 because the local server is authoritative for operations.

## Identity exceptions and overrides

If the Government ID is absent or the displayed Full Name, Gender, or Date of
Birth does not match, the student uses a visually secondary **Send to Help
Desk** control. The exception:

- records the athlete, volunteer, counter, reason, and server timestamp;
- does not assign a wristband;
- does not mark Stage 1 complete;
- does not enqueue Stage 1 RaceResult updates.

Only a Super Admin or Event Admin may resolve the exception. An override
requires a reason and creates a new immutable audit event linked to the
exception. The original mismatch is never overwritten. Required photo or
signature evidence may also be waived only through this audited Admin flow.

Asset replacement follows the same principle. A student cannot silently replace
an active wristband or transponder. The Help Desk/Admin must provide a reason,
release the previous assignment, and create a linked replacement record.

## RaceResult field contract

Field names and values are case-sensitive. Each stage enqueues and immediately
attempts its own RaceResult updates after the local transaction commits.

| Stage | Default field | Value |
|---|---|---|
| Stage 1 | `stage1checkin` | `COMPLETED` |
| Stage 1 | `stage1checkintime` | Event-local `YYYY-MM-DD HH:mm:ss` |
| Stage 1 | `wristbandID` | Scanned wristband ID |
| Stage 2 | `stage2checkin` | `COMPLETED` |
| Stage 2 | `stage2checkintime` | Event-local `YYYY-MM-DD HH:mm:ss` |
| Stage 2 | `Transponder1` | Scanned transponder ID |

The published Admin update mapping may explicitly override these default field
names. Values use the stage's authoritative server completion time converted
to the event timezone. The timestamp sent to RaceResult is not taken from the
browser clock.

Each field has a distinct idempotent outbox operation:

```text
checkin-stage1:<stage-transaction-id>:status
checkin-stage1:<stage-transaction-id>:time
checkin-stage1:<stage-transaction-id>:wristband
checkin-stage2:<stage-transaction-id>:status
checkin-stage2:<stage-transaction-id>:time
checkin-stage2:<stage-transaction-id>:transponder1
```

The delivery service attempts each operation immediately. Internet or
RaceResult failure leaves a visible **Sync pending** or **Needs attention**
state and retries automatically through the existing durable worker. It never
rolls back the accepted local handover or requires the volunteer to wait.

## State model

Each participant has independent Stage 1 and Stage 2 operational states:

- `not_started`
- `pending_sync`
- `completed`
- `attention`

`pending_sync` means the local stage is complete but one or more RaceResult
operations are not yet confirmed. `completed` means every RaceResult operation
for that stage is confirmed. `attention` means local evidence remains valid but
delivery or an operational conflict requires Admin review.

The UI must always distinguish local acceptance from RaceResult confirmation.
A stage rescan shows its receipt and current sync state rather than starting a
duplicate workflow.

## Data model and audit evidence

Stage 1 and Stage 2 are separate immutable transactions. Each transaction stores
or snapshots:

- transaction and idempotency IDs;
- event and participant IDs;
- BIB and identity display values;
- contest, wave, and Doubles club context;
- stage type and operational state;
- counter and counter-assignment IDs;
- volunteer, authenticated session, device label, and source IP;
- authoritative server completion time and optional diagnostic browser time;
- wristband or transponder assignment;
- Government-ID-verification declaration for Stage 1;
- participant declaration text and version;
- optional signature and participant-photo references;
- linked exception or override references;
- RaceResult outbox operation IDs and delivery state.

The migration preserves existing check-in and asset history. It does not invent
Stage 1 or Stage 2 completion evidence for historical rows. Legacy combined
records remain visible to Admin as legacy records and do not silently satisfy
the new Stage 2 prerequisite.

Submission is idempotent. Repeated taps, browser retries, or response timeouts
return the original accepted transaction and cannot assign an asset twice.
Active asset codes remain unique per event and asset type.

## Photo, signature, and declaration

Admin provides two independent event settings:

- **Require participant photo**, OFF by default
- **Require declaratory signature**, OFF by default

Admin also configures the declaration text. Every change creates a new
version; Stage 1 stores the exact accepted version. When signature is disabled,
the volunteer records the athlete's verbal acceptance with a large confirmation
control. Identity verification itself is always mandatory.

When photo capture is enabled:

- only a live participant photo is captured;
- the UI offers front/rear camera selection and retry;
- the browser creates an upload-sized image for fast local transfer;
- the server stores the accepted capture outside the public web directory;
- server metadata records event, BIB, transaction, trusted timestamp, checksum,
  MIME type, dimensions, and byte size;
- the displayed audit copy may render a timestamp/event/BIB overlay, while the
  original accepted file and trusted metadata remain available for integrity
  verification.

When signature capture is enabled, the athlete signs a large touch canvas with
clear and redo controls. The server stores the signature image, declaration
version, transaction, checksum, and trusted timestamp.

Only Super Admin and Event Admin roles may retrieve historical media. Each view
or download is itself audited. Operational student screens may show the current
capture during review but cannot browse previous athletes' media.

Photo and signature retention defaults to 30 days after the event end. The
retention value is Admin-configurable. A scheduled cleanup permanently deletes
expired media and records a deletion audit event while retaining non-media
check-in evidence. Deployment procedures must include encrypted storage,
database backups that respect the same retention policy, and restricted file
permissions.

## Admin controls

Admin gains:

- counter type selection for Stage 1 or Stage 2;
- independent photo/signature requirement switches;
- versioned declaration text;
- media retention in days, default 30;
- current participant stage and RaceResult synchronization overview;
- identity-exception resolution with mandatory reason;
- asset replacement with mandatory reason;
- audited media review;
- filterable Stage 1/Stage 2 transaction and sync history.

Changing a counter's type is blocked while volunteers are actively assigned.
Admin must release the assignments, change the counter, and reassign volunteers,
preserving a clear history.

## Student-facing interface

The assigned stage is prominent in the header. The screen shows one large
primary action at a time and uses plain instructions:

- **Government ID verified**
- **Take photo**
- **Sign declaration**
- **Scan wristband**
- **Scan transponder**
- **Complete Stage 1** or **Complete Stage 2**
- **Next athlete**

The participant card places identity before equipment controls. Full Name and
BIB are largest; Gender, DOB, Contest, and Wave Time are clearly labelled.
Doubles teammate context is visually separate and never obscures the scanned
athlete.

Tablet layout uses identity and action columns where space allows. Mobile uses
one vertical flow with a sticky primary action. Primary touch targets are at
least 56px high, status never relies on colour alone, camera/manual entry are
both available, and confirmation screens repeat the BIB and asset code.

The Help Desk action is deliberately smaller and separated from the primary
flow, but remains discoverable. Error messages tell the student what happened
and the single next safe action.

## Failure and recovery behavior

- **RaceResult/internet unavailable:** accept locally, show sync pending, retry
  automatically, and move to the next athlete.
- **Local server unavailable:** show a blocking connection screen; do not create
  browser-only handovers that cannot enforce uniqueness.
- **Camera unavailable or QR unreadable:** allow manual BIB or asset-code entry
  with a review step.
- **Required participant photo cannot be captured:** retry or send to Help Desk;
  only Admin may waive it.
- **Stage 1 absent at Stage 2:** block transponder assignment and direct the
  athlete to Stage 1 or Help Desk.
- **Stage already complete:** display the receipt and sync state; never create a
  duplicate.
- **Asset already assigned:** block completion and route to Admin replacement.
- **Doubles data incomplete:** warn and audit, but allow the scanned individual's
  workflow.
- **Double tap or response timeout:** replay the original idempotent result.
- **Partial RaceResult success:** retain confirmed operations, retry only the
  remainder, and show the stage as pending.

## API boundaries

The server exposes focused interfaces for:

- authenticated counter context including stage type and event feature flags;
- participant identity, teammate, and both-stage status lookup;
- Stage 1 completion;
- Stage 2 completion;
- stage receipt and synchronization status;
- media upload bound to an active transaction;
- Help Desk exception creation and Admin resolution;
- Admin asset replacement;
- authorized, audited media retrieval.

The server derives event, volunteer, counter, counter type, session, device, IP,
timezone, and authoritative timestamps from authenticated state. Request bodies
cannot override these values.

## Verification

Automated verification covers:

- `Gender`, `DateOfBirth`, and `club` mapping and persistence;
- Doubles grouping within the same contest and malformed-team warnings;
- counter-type authorization and stage-specific allowed actions;
- mandatory identity-verification declaration;
- independent photo and signature feature flags;
- declaration version retention;
- Stage 2 prerequisite enforcement based on local Stage 1 evidence;
- asset uniqueness, replacement history, and idempotent replay;
- exact RaceResult field names, casing, values, and event-local timestamps;
- immediate delivery, partial success, retries, and sync-state aggregation;
- exception/override authorization and immutable audit linkage;
- media upload authorization, checksums, non-public storage, audited retrieval,
  and retention deletion;
- existing-record migration without fabricated stage evidence;
- QR and manual-entry flows;
- mobile and tablet layouts, touch targets, screen-reader labels, and
  colour-independent statuses;
- full lint, unit/integration tests, production build, and local authenticated
  Stage 1/Stage 2 smoke tests.

## Out of scope

- photographing or storing Government IDs or Government ID numbers;
- combining Doubles partners into one operational participant;
- permitting Stage 2 before authoritative local Stage 1 completion;
- storing asset handovers only in a browser while the local server is offline;
- waiting for RaceResult confirmation before serving the next athlete;
- allowing student volunteers to resolve identity exceptions or replace active
  assets;
- public or unaudited access to participant photos and signatures.
