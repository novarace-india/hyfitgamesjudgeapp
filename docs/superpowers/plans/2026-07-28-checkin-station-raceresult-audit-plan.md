# Check-in Station, RaceResult Sync, and Audit Implementation Plan

1. Add a forward-only PostgreSQL migration for check-in stations, volunteer
   assignments, immutable check-in snapshots, and idempotent transactions.
2. Extend authentication context with the exact session ID and trusted device/IP
   metadata required by audit records.
3. Add Admin APIs for station creation, enablement, assignment, reassignment,
   and assignment history with event and role validation.
4. Add Admin UI for managing counters and assigning check-in volunteers.
5. Replace the client-provided desk value in check-in completion with the
   authenticated volunteer's active server-side station assignment.
6. Store complete check-in evidence and queue exactly `checkinstatus`,
   `wristbandid`, and `Transponder1` in one transaction.
7. Add a check-in status endpoint and update the volunteer UI to show its
   assigned station and RaceResult pending/confirmed/attention state.
8. Make worker reconciliation specific to the current check-in transaction.
9. Update seed/default mappings and create a seeded counter assignment.
10. Add route/domain tests for exact casing, station trust, audit snapshots,
    idempotency, partial confirmation, and failure handling.
11. Run migration, build, lint/tests, and a local authenticated smoke test before
    committing the implementation.
