# Admin Participant Sync Design

## Goal

Allow Event Control to fetch participants from the active event's published RaceResult configuration and make them immediately available to Check-in and Judge devices through PostgreSQL.

## Workflow

The RaceResult integration screen and Live Overview expose **Sync participants now**. The action is available only to Super Admin and Event Admin users and cannot run without a published configuration and participant endpoint.

The server:

1. loads the active event's published endpoint and participant field mappings;
2. fetches the endpoint with an eight-second timeout;
3. resolves the configured list and nested field paths;
4. accepts only records with a numeric BIB and nonempty name;
5. rejects duplicate BIBs within the source payload;
6. upserts valid participant identity/profile fields in one database transaction;
7. preserves local check-in state, wristband/transponder history, race sessions, penalties, and audit records;
8. records a sync run and audit event with imported, inserted, updated, rejected, and unchanged counts.

The response and Admin UI show the result, completion time, and rejected count. Check-in searches the same PostgreSQL participant table and therefore sees imported athletes immediately.

## Scheduling and concurrency

Manual sync is the first operational control. The same import service is reusable by a scheduled server process. Concurrent sync requests for one event are serialized with a PostgreSQL advisory lock; a second request receives a clear `sync already running` response.

RaceResult remains authoritative for synchronized participant profile fields. The importer does not delete locally cached participants merely because they are absent from one response; removal/archival requires a separate explicit reconciliation policy.

## Errors and security

Endpoint values remain server-side. Authentication, HTTP failures, timeouts, invalid JSON, invalid list paths, and empty valid rosters produce actionable errors and a failed `sync_runs` record. A failed sync does not modify the last valid roster.

## Verification

Tests cover mapping aliases, numeric/duplicate validation, upsert classification, preservation of operational fields, authorization, and failed-fetch behavior. Lint, production build, all tests, and a local authenticated sync smoke test must pass.
