# HYFIT Local Race Operations Platform

## Technical, Networking, and Operations Design

**Status:** Approved design for team review  
**Deployment model:** One active event on one on-site server  
**Primary database:** RaceResult 14  
**Local operational store:** PostgreSQL  
**Expected field load:** Approximately 60 judges, several check-in volunteers, and a small Event Control team

## 1. Purpose

This document defines the end-to-end HYFIT race-day platform that combines:

- an Admin and Event Control dashboard;
- volunteer check-in;
- the mobile/tablet Judge App;
- per-event RaceResult 14 participant and scoring integration;
- local-network hosting, authentication, synchronization, audit, backup, and recovery.

The platform is designed to run from an event laptop on a dedicated venue network. RaceResult 14 remains the participant and scoring system of record. The local platform provides the fast operational workflows, concurrency protection, durable offline queue, and auditability required inside the arena.

## 2. Confirmed operating assumptions

- One local server runs one live event at a time.
- Past and future events remain available for configuration, cloning, reporting, and audit.
- The server and field devices use a dedicated router controlled by the event team.
- The event laptop has a fixed LAN address.
- Approximately 60 judges use phones or tablets concurrently.
- A small number of administrators use the Admin Dashboard.
- Check-in volunteers use phones or tablets with cameras.
- Every user has an individual ID and short PIN.
- Participant check-in QR codes contain only the numeric RaceResult BIB.
- Wristbands carry generic unique QR values and are assigned at check-in.
- Each participant receives one generic wristband and one `Transponder1`.
- RaceResult 14 is the master database and single source of truth for participant and scoring fields.
- Check-in and judging may continue while RaceResult is temporarily unavailable. Updates remain visibly pending and retry automatically.

## 3. Selected architecture

The platform will be a modular monolith. One deployable application exposes three role-specific browser experiences while keeping clear internal module boundaries:

1. Admin and Event Control
2. Volunteer Check-in
3. Judge App

Supporting modules provide authentication, PostgreSQL persistence, RaceResult synchronization, real-time events, audit logging, system health, and backup management.

```text
Admin browsers       Check-in devices       Judge devices
      \                     |                    /
       \--------- Local HTTPS / WebSocket ------/
                            |
                  HYFIT application server
        +-------------------+-------------------+
        | Auth | Admin | Check-in | Judging     |
        | Rules | RaceResult Sync | Audit       |
        +-------------------+-------------------+
                            |
                       PostgreSQL
              operational cache + locks +
                outbox + audit + history
                            |
                   RaceResult connector
                     GET / POST / retry
                            |
                 RaceResult 14 master data
```

This approach was selected instead of separate services because a single event laptop must be simple to deploy, observe, back up, and recover. Module boundaries will allow later separation if the platform becomes multi-event or multi-site.

## 4. Data ownership

### 4.1 RaceResult-owned data

RaceResult is authoritative for:

- participant identity and numeric BIB;
- participant category, wave, and other imported participant fields;
- check-in fields configured for write-back;
- active wristband and `Transponder1` fields configured for write-back;
- station penalty fields;
- cognitive skill penalty;
- final scoring data.

### 4.2 Locally owned operational data

The local platform is authoritative for:

- users, roles, PIN credentials, and device sessions;
- draft and published event configuration;
- rule versions and the configuration snapshot used by an active race session;
- local check-in transaction history;
- wristband and transponder assignment/replacement history;
- judge-to-athlete locks and active race sessions;
- durable outbound operations awaiting RaceResult confirmation;
- conflict decisions, audit records, system health, and backups.

The local participant table is a synchronized operational cache. It does not replace RaceResult as the participant master.

## 5. Core data model

### 5.1 Event configuration

- `events`: identity, venue, dates, time zone, lifecycle, active flag.
- `event_config_versions`: immutable published snapshots.
- `stations`: ordered station definitions belonging to a configuration version.
- `penalty_presets`: permitted values and labels per station.
- `cognitive_rules`: sequence length, colors, timer, threshold, and penalty.
- `integration_configs`: encrypted RaceResult endpoints and operational settings.
- `field_mappings`: participant import paths and update field names.

### 5.2 Identity and access

- `users`: individual staff identity and enabled state.
- `credentials`: salted and hashed PIN material.
- `roles`: Super Admin, Event Admin, Check-in Volunteer, Judge, and Read-only Control.
- `event_assignments`: role, event, station or operational area.
- `sessions`: login, expiry, device identity, revocation, and last activity.
- `login_attempts`: throttling and temporary lock records.

### 5.3 Participants and check-in

- `participants`: RaceResult identity, BIB, synchronized profile, source revision, and last sync.
- `check_ins`: verification state, volunteer, desk, timestamps, and synchronization state.
- `wristband_assignments`: wristband value, participant, active flag, assignment/replacement metadata.
- `transponder_assignments`: `Transponder1` value, participant, active flag, assignment/replacement metadata.

Database constraints enforce one active wristband per participant, one active participant per wristband, one active transponder per participant, and one active participant per transponder within an event.

### 5.4 Judging

- `judge_assignments`: user-to-event/station authority.
- `race_sessions`: athlete, judge, rule snapshot, progress, lifecycle, and finalization.
- `penalty_events`: append-only station penalty and undo actions.
- `cognitive_attempts`: sequence, response, correctness, percentage, and resulting penalty.
- `judged_results`: consolidated read model for history and Event Control.

Server-side uniqueness and transactions prevent two judges from claiming the same athlete simultaneously.

### 5.5 Synchronization and audit

- `sync_runs`: participant fetch attempts and import statistics.
- `outbox_operations`: idempotent RaceResult POST operations, retry state, and result.
- `reconciliation_conflicts`: local/RaceResult divergence and control decision.
- `audit_events`: actor, role, device, event, action, target, before/after values, reason, and timestamp.
- `system_backups`: snapshot location, checksum, encryption, verification, and restore-test status.

All mutable operational records include event ID, version, actor, device, creation/update timestamps, and synchronization state where applicable.

## 6. Admin and Event Control Dashboard

### 6.1 Live Overview

The landing dashboard shows:

- active event and published configuration version;
- roster size and rejected participant records;
- checked-in count and throughput;
- athletes on course;
- online judges and check-in desks;
- RaceResult connection and last successful sync;
- pending, failed, and conflicted operations;
- backup health and storage status;
- actionable exception queue.

### 6.2 Events

Administrators can:

- create, edit, clone, archive, and activate events;
- set venue, schedule, time zone, and operational status;
- prepare a draft configuration;
- validate and publish an immutable configuration version;
- activate only one live event;
- close the event and retain complete history.

### 6.3 Team and Access

Administrators can:

- create users individually or through validated import;
- assign roles, stations, desks, and events;
- generate staff IDs and temporary PINs;
- force PIN reset, disable users, revoke sessions, and reassign duties;
- view sign-in and device activity.

### 6.4 Rules and Stations

Administrators configure:

- station order and display names;
- station instructions and evidence/notes requirements;
- quick penalty presets and allowed custom ranges;
- cognitive sequence rules, display duration, scoring threshold, and penalty;
- which RaceResult field receives each result.

Draft configuration can be edited freely. Publishing freezes a version. After an event becomes live, changes require Event Admin authority, explicit confirmation, a reason, and a new version. Existing race sessions retain their original rule snapshot.

### 6.5 RaceResult Integration

Per event, administrators configure:

- complete participant-fetch endpoint;
- complete POST update endpoint;
- participant list path;
- BIB, name, category, wave, status, and participant ID paths;
- check-in, wristband, `Transponder1`, station penalty, and cognitive penalty field names;
- refresh interval, timeout, and retry policy.

Secrets and complete endpoints are encrypted at rest and never returned to field-device browsers. A configuration must pass connectivity, payload, numeric-BIB, duplicate-BIB, and safe write tests before it can be published.

### 6.6 Participants and Check-in Control

Event Control can:

- search the synchronized roster;
- inspect check-in and assignment state;
- monitor desk throughput and device health;
- resolve rejected imports;
- replace a wristband or transponder through an authorized, reasoned action;
- see pending RaceResult updates and conflicts;
- reprint or display participant details without exposing integration secrets.

### 6.7 Exceptions, Audit, and Reports

The dashboard provides:

- duplicate or already-assigned asset alerts;
- failed and exhausted outbox operations;
- reconciliation conflicts;
- judge assignment conflicts;
- user/device access events;
- searchable immutable audit history;
- check-in, scoring, sync, and exception exports.

## 7. Check-in workflow

1. The volunteer signs in with individual ID and PIN.
2. The volunteer selects or receives an assigned check-in desk.
3. The volunteer scans the participant's QR code.
4. The application accepts only a numeric BIB and resolves it against the synchronized event roster.
5. The volunteer verifies the participant details displayed from RaceResult.
6. The volunteer scans a generic wristband QR.
7. The server checks wristband uniqueness inside a database transaction.
8. The volunteer scans the `Transponder1` QR.
9. The server checks transponder uniqueness inside the same transaction.
10. The volunteer confirms the complete assignment.
11. PostgreSQL commits the check-in, wristband, transponder, and audit records atomically.
12. Idempotent RaceResult update operations enter the durable outbox.
13. The UI displays `RaceResult confirmed`, `Pending sync`, or `Conflict`.

Manual entry is available as a controlled fallback for damaged QR codes. It requires confirmation and is recorded in the audit history.

Replacement of a wristband or transponder never erases the original assignment. The old assignment becomes inactive, the replacement records the authorizing user and reason, and RaceResult receives the new active value.

## 8. Judge workflow

1. The judge signs in with individual ID and PIN.
2. The server returns only assigned events and stations.
3. The judge scans the athlete's generic wristband QR.
4. The server resolves the active wristband assignment to the participant and RaceResult BIB.
5. The judge verifies athlete details.
6. The server atomically locks the athlete to that judge/race session.
7. The Judge App uses the published rule snapshot for all stations and cognitive scoring.
8. Every penalty and undo is recorded as an append-only event and queued for RaceResult.
9. Brief Wi-Fi or RaceResult outages do not discard judge work; the client and server outboxes retry.
10. Until Final Finish, the judge may revisit completed stations and revoke or modify penalties.
11. After Final Finish, the result becomes read-only to the judge; the judge can see actions they entered.
12. Event Admin overrides require a reason and create separate audit events.

## 9. RaceResult synchronization

### 9.1 Participant ingestion

- The server fetches participants on the configured interval and on authorized manual refresh.
- Payload paths are resolved through published field mappings.
- Only numeric, unique BIB records with required identity fields become active participants.
- Invalid and duplicate records are quarantined and reported, not silently discarded.
- A failed fetch preserves the last valid local snapshot and marks it stale.
- Import runs record counts, rejects, timing, endpoint configuration version, and errors.

### 9.2 Write-through outbox

All RaceResult changes use a durable outbox:

1. Commit the operational transaction and audit record locally.
2. Create one idempotent outbox operation for each mapped RaceResult field.
3. POST using the published event endpoint.
4. Record the HTTP outcome and confirmed time.
5. Retry transient failures with bounded exponential backoff and jitter.
6. Move exhausted or structurally rejected operations to Event Control.

The existing RaceResult update contract uses POST requests with:

- `bib`
- `fieldname`
- `value`
- `nohistory=0`

The connector must URL-encode values, enforce event-scoped field allowlists, use timeouts, and avoid logging endpoint secrets.

### 9.3 Reconciliation

Subsequent participant syncs compare RaceResult values with confirmed local intent.

If values differ, Event Control chooses:

- **Accept RaceResult:** local operational cache adopts the master value.
- **Reapply local:** create a new audited POST operation.
- **Investigate:** keep the conflict open without changing either side.

No background process silently overwrites an unresolved conflict.

## 10. Local network topology

```text
Internet / RaceResult 14
          |
    Venue router WAN
          |
  Dedicated event LAN / Wi-Fi
    |          |           |
 Event       Admin       60+ field
 laptop      devices     phones/tablets
 fixed IP
    |
 HTTPS reverse proxy
    |
 HYFIT app + PostgreSQL + worker + backups
```

### 10.1 Router requirements

- Dedicated SSID for event operations.
- WPA2/WPA3 security with a controlled passphrase.
- Fixed DHCP reservation for the event laptop.
- Client-to-client communication permitted where required.
- AP isolation disabled for the operational SSID.
- Sufficient access-point capacity and coverage for at least 75 concurrent devices.
- 5 GHz preferred, with 2.4 GHz available for compatibility/coverage.
- Outbound HTTPS access to the configured RaceResult host.
- No inbound internet port forwarding to the event laptop.
- Guest/public traffic separated from event operations.

### 10.2 HTTPS and mobile camera access

Mobile camera APIs require a secure browser context. The production LAN must not use a plain `http://<LAN-IP>` URL.

The deployment will provide:

- a stable local hostname;
- a locally trusted certificate and private key on the event server;
- a documented one-time certificate trust/onboarding procedure for managed field devices;
- a secure app-access QR code;
- certificate-expiry monitoring;
- a pre-event test covering iOS Safari and Android Chrome.

The certificate authority private key is protected and unavailable to normal application users. A public HTTPS tunnel may be used for development but is not the primary race-day architecture.

## 11. Authentication and authorization

- Every staff member uses an individual ID and short PIN.
- PINs are salted and hashed; plaintext PINs are never stored.
- Temporary PINs require reset according to event policy.
- Repeated failures trigger progressive delay and temporary lock.
- Sessions have inactivity and absolute expiration.
- Administrators can revoke users or device sessions immediately.
- API authorization is enforced server-side for every operation.
- Role and event/station scope are checked independently.
- Sensitive actions require re-confirmation and a reason.
- Integration endpoints, secrets, password hashes, and backup keys never reach browser clients.

Initial roles:

- **Super Admin:** system, backup, all-event, and credential authority.
- **Event Admin:** active-event configuration, operations, reconciliation, and override authority.
- **Check-in Volunteer:** roster verification and normal assignment actions.
- **Judge:** assigned athlete/station scoring actions.
- **Read-only Control:** dashboards, status, and reports without mutation.

## 12. Availability, offline behavior, and concurrency

- PostgreSQL transactions and unique constraints protect assignments under concurrent scans.
- Real-time server events update dashboards and participant state.
- Clients fall back to short polling if the real-time channel is unavailable.
- Judge and check-in clients retain a minimal local retry queue during brief LAN interruptions.
- Operations have stable idempotency keys so retries do not create duplicate effects.
- The server is authoritative for assignment locks; offline clients cannot independently claim a new athlete when the server is unreachable.
- An already active judge session may continue recording locally during a brief interruption and sync when connectivity returns.
- All screens clearly show local connection, server confirmation, RaceResult confirmation, and conflict states separately.

## 13. Backup and disaster recovery

### 13.1 Backup policy

- Encrypted PostgreSQL snapshots at a short configurable interval.
- Backup copies written to a second physical storage device.
- Pre-event baseline backup after configuration and roster validation.
- Backup immediately before the event goes live.
- Periodic race-day backups.
- End-of-event final backup and exported audit/report bundle.
- Checksums and automated restore verification recorded for every snapshot.

### 13.2 Standby recovery

A prepared standby laptop contains the same application version and deployment tooling.

Recovery procedure:

1. Isolate the failed server.
2. Connect the standby laptop to the router using the reserved server address.
3. Restore the newest verified encrypted snapshot.
4. Start the application bundle.
5. Run database, HTTPS, participant, outbox, and device-login health checks.
6. Reconcile operations created after the backup from client queues and RaceResult.
7. Record the incident and recovery times.

The operations team performs at least one timed restore rehearsal before the event.

## 14. Packaging and deployment

The local platform will ship as a versioned Docker Compose bundle containing:

- application/API server;
- PostgreSQL;
- RaceResult sync worker;
- HTTPS reverse proxy;
- backup/verification job.

The bundle includes:

- environment and secret templates;
- database migrations;
- initial Super Admin bootstrap;
- start, stop, backup, restore, health-check, and diagnostics commands;
- log rotation;
- release manifest and checksum;
- upgrade and rollback procedure.

The application will not depend on Railway or another cloud runtime.

## 15. Observability

Event Control and local logs expose:

- application, database, disk, and memory health;
- connected and recently active device counts;
- participant sync timing and rejected records;
- RaceResult latency and failure rate;
- outbox depth, oldest pending age, and exhausted operations;
- active judge sessions and assignment conflicts;
- check-in throughput and duplicate scans;
- backup age and verification state;
- certificate expiry.

Logs use correlation and operation IDs. Secrets and full sensitive participant payloads are redacted.

## 16. Delivery phases

### Phase 1: Local platform foundation

- PostgreSQL schema and migrations
- Docker Compose local deployment
- local HTTPS and network runbook
- users, PIN login, roles, sessions
- event CRUD, lifecycle, and configuration versions
- audit foundation
- RaceResult connector configuration and test tools

### Phase 2: Participant synchronization and Admin Control

- participant import/cache/reconciliation
- roster and import exceptions
- dashboard health and live operations
- team onboarding and assignments
- rules/stations/cognitive configuration
- durable outbox and conflict queue

### Phase 3: Volunteer Check-in

- BIB QR lookup
- participant verification
- unique wristband and `Transponder1` assignment
- replacement/override workflow
- RaceResult field write-back
- desk monitoring and throughput

### Phase 4: Centralized Judge App

- real judge authentication
- wristband-to-participant lookup
- server-authoritative athlete locks
- dynamic published rules
- central penalty/audit persistence
- RaceResult scoring updates and undo
- read-only post-finish history

### Phase 5: Hardening and race rehearsal

- load and concurrency testing at more than expected device count
- Wi-Fi loss and RaceResult outage exercises
- backup/restore rehearsal
- mobile/browser compatibility
- security review
- operational training, checklists, and go-live sign-off

Each phase produces a usable, tested increment and a migration path from the current Judge App.

## 17. Acceptance criteria

The platform is ready for a live event when:

- at least 75 concurrent simulated field clients operate within agreed latency;
- duplicate wristband, transponder, and athlete claims are prevented transactionally;
- every privileged mutation appears in the audit ledger;
- participant import rejects malformed/duplicate BIB records safely;
- check-in and judging continue through a simulated RaceResult outage and later reconcile;
- no RaceResult endpoint secret is present in browser traffic or client bundles;
- supported iOS and Android devices can scan QR codes over local HTTPS;
- an event configuration cannot change underneath an active race session;
- the Event Control dashboard distinguishes confirmed, pending, stale, failed, and conflicted states;
- a verified backup restores successfully to the standby laptop within the operations team's recovery objective;
- application restart does not lose committed check-in, judging, outbox, or audit data.

## 18. Pre-event networking and operations checklist

### Network

- Router firmware and configuration approved.
- Dedicated operations SSID active and coverage-tested.
- Server DHCP reservation verified.
- AP isolation disabled for the operations network.
- RaceResult endpoint reachable from the server.
- Capacity tested with at least expected device count.
- Spare router/access point and cabling available.

### Server

- Approved application release and checksum installed.
- Database migrations complete.
- Disk space, clock synchronization, and power settings verified.
- UPS/power backup connected.
- HTTPS hostname and certificate verified on supported mobile devices.
- Backup destination connected and encrypted.
- Standby laptop restore rehearsal complete.

### Application

- Event configuration published.
- RaceResult fetch and POST tests pass.
- Participant roster synchronized and rejected rows resolved.
- Staff accounts, roles, PINs, stations, and desks verified.
- Rules and field mappings signed off.
- Outbox empty before gates open.
- Wi-Fi and app-access QR codes printed.

### Operations

- Event Control, check-in, judging, network, and recovery owners named.
- Escalation contacts and decision authority documented.
- Replacement wristband/transponder procedure rehearsed.
- RaceResult outage and server recovery procedures rehearsed.
- End-of-event close, reconciliation, export, and backup procedure assigned.

## 19. Decisions intentionally deferred to implementation planning

The design fixes behavior and ownership but leaves these replaceable implementation details to the implementation plan:

- exact local DNS and certificate tooling selected with the networking team;
- exact PostgreSQL backup utility and retention intervals selected with operations;
- exact RaceResult participant payload paths and additional-field names entered per event;
- final session timeouts and PIN policy values selected by Event Control;
- final load-test latency and recovery-time targets agreed before go-live.

These are deployment parameters, not unresolved product behavior.
