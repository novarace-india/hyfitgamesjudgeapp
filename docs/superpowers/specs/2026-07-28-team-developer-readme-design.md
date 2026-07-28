# HYFIT Team Developer README Design

Date: 28 July 2026

Status: Approved design, pending written-spec review

## Objective

Replace the obsolete root `README.md` with one accurate, team-facing source-code
handoff document. A new developer should be able to understand the system,
prepare a Mac or Windows workstation, run it safely, select an initial task, and
submit a reviewable change without relying on verbal instructions.

## Audience

The README serves:

- application developers;
- database/backend developers;
- frontend developers;
- QA and integration engineers;
- technical leads reviewing pull requests;
- event-technology personnel who need a development instance.

The race-day networking team continues to use the dedicated operations runbook.

## Required sections

1. Product purpose and current capabilities.
2. Modular-monolith architecture and local data flow.
3. Technology and supported developer prerequisites.
4. Fast setup using Docker Compose.
5. Native Mac and Windows setup.
6. Environment variables and secret-handling rules.
7. Database migrations, seed data, backup, and restore.
8. Application URLs and seeded development accounts.
9. RaceResult participant import and update configuration.
10. Exact RaceResult contracts for check-in and penalties.
11. HTTPS requirements for mobile QR scanning.
12. Repository map and ownership boundaries.
13. Development, build, lint, and test commands.
14. Contribution workflow, branch naming, commit quality, and pull-request
    checklist.
15. Database/API compatibility and audit requirements.
16. Troubleshooting common local failures.
17. Known limitations and operational cautions.
18. Links to approved designs and the race-day operations runbook.
19. A first-day checklist for newly onboarded contributors.

## Accuracy decisions

- Local hosting is the primary operational model. Railway is described only as
  retained repository compatibility, not the recommended event architecture.
- PostgreSQL is the operational database and RaceResult 14 is the master data
  destination/source of truth.
- The README must distinguish development HTTP from trusted HTTPS required for
  phone camera access.
- The RaceResult update endpoint is configured per published event in Admin,
  not repeated on every judge device.
- Participant import is initiated using **Sync participants now**.
- Check-in sends exactly `checkinstatus`, `wristbandid`, and `Transponder1`.
- Penalties use `station1penalty` through `station6penalty` and
  `cognitiveskillpenalty`.
- All RaceResult update requests use POST and `nohistory=0`.
- The durable outbox worker is a required process for automatic RaceResult
  delivery.
- Seed credentials are development-only and must be changed before real use.
- Developers must never commit `.env` files, credentials, participant exports,
  database dumps, or certificate private keys.

## Contribution contract

The README will require contributors to:

- branch from an up-to-date `main`;
- use focused branches and descriptive commits;
- include migrations for schema changes and never edit an applied migration;
- preserve audit history and local-first/outbox semantics;
- add or update tests;
- run build, lint, tests, and migration verification;
- avoid real RaceResult mutations during automated or smoke testing;
- document configuration and operational changes;
- submit pull requests with behavior, risk, migration, test, and rollback notes.

## Presentation

The README will use concise prose, commands that can be copied safely, compact
tables for ports/environment variables, and links to deeper repository
documents. It will avoid reproducing the entire race-day runbook.

Commands will not embed real RaceResult credentials. Example secrets will be
clearly marked and development-only accounts will be labelled accordingly.

## Acceptance criteria

- No obsolete claim says the application is only a frontend demonstration.
- Setup instructions match the current scripts and Docker Compose services.
- All current app routes and required background processes are documented.
- RaceResult field names use exact casing.
- Mac, Windows, and Docker users have viable setup paths.
- A new developer can identify the correct files for Admin, Check-in, Judge,
  database, worker, tests, and documentation changes.
- Git and pull-request expectations are explicit.
- Security, privacy, audit, and live-system warnings are prominent.
- All referenced local files exist.
