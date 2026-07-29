# Manual Timing, ICS, and Cognitive Console Implementation Plan

## Visual direction

- **Subject:** a race marshal board for student field judges.
- **Palette:** Track Black `#0b0d0c`, Lane Charcoal `#171b19`, HYFIT Lime
  `#d8ff32`, Signal Blue `#64c8ff`, Caution Amber `#ffc857`, and ICS Red
  `#ff6259`.
- **Type:** retain the app's compact athletic display treatment; use a highly
  legible system sans for instructions and a tabular numeric face for clocks.
- **Layout:** a persistent participant/timer rail above one large active-stage
  card; mobile uses one column and a sticky bottom action, while tablet uses a
  two-column course/status and controls layout.
- **Signature:** the stage-boundary control visibly names both effects, such as
  “Complete Tyre Flips → Start cognitive recall,” reflecting the atomic timing
  boundary.

The direction intentionally avoids a dense admin dashboard. Student operators
see one action, one short instruction, and only the outcomes allowed at the
current station.

## Delivery sequence

1. Add timing, split, station-outcome, cognitive-attempt, and RR14 action-group
   storage through an additive migration.
2. Define the fixed race-stage contract and timing/scoring helpers with unit
   tests.
3. Add authenticated race-state, start, stage-completion, cognitive-recall, and
   finish APIs with idempotent append-only writes.
4. Extend RR14 field validation and grouped queuing for penalty, ICS, note,
   Status, cognitive penalty, and cognitive bonus fields.
5. Replace the judge race flow with the guided timing console while preserving
   login, participant lookup, and claim protection.
6. Build large mobile/tablet controls, automated cognitive boundaries, live
   timestamp-derived clocks, OOC presentation, and result splits.
7. Add automated tests for sequence transitions, timing boundaries, station
   rules, cognitive scoring, RR14 field groups, and idempotency.
8. Apply the migration locally, run lint/build/tests, and verify the responsive
   interface at mobile and tablet viewport sizes without contacting live RR14.
