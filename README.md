# HYFIT Games Race Operations Platform

HYFIT is a local-first race-operations platform for event administration,
athlete check-in, field judging, cognitive-skill scoring, and RaceResult 14
integration.

The application is designed to run as one modular monolith on an event server.
Judges, volunteers, and administrators use phones, tablets, or laptops on the
same private arena network. PostgreSQL stores the live operational state and
audit history. RaceResult 14 remains the master participant and scoring system.

This README is the primary developer handoff. Race-day networking and recovery
procedures are maintained separately in the
[local network operations runbook](docs/operations/HYFIT-local-network-race-day-runbook.md).

## What is implemented

### Event Control and Admin

- Event and central RaceResult configuration
- Versioned participant and update field mappings
- Operator-triggered RaceResult participant synchronization
- Staff onboarding and role-based access
- Check-in counter creation and volunteer assignment
- Operational health, pending outbox, and conflict counts
- Immutable audit events for sensitive actions

### Athlete check-in

- Numeric BIB QR lookup
- Admin-controlled counter assignment
- Wristband QR and Transponder1 QR assignment
- Duplicate asset protection
- Full local audit snapshots for participant, volunteer, counter, device, IP,
  assets, session, and server time
- Durable RaceResult delivery with pending, confirmed, and conflict states

### Judging

- Judge authentication and athlete claiming
- Central duplicate-assignment protection
- Six-station penalty workflow
- Cognitive R/G/Y preview, recall, transparent reveal, and correctness score
- Penalty revision and undo until Final Finish
- Read-only completed-athlete history
- Device-local recovery support

### RaceResult integration

- GET participant import from a published event endpoint
- POST participant-field updates through a durable PostgreSQL outbox
- Automatic retry with backoff
- Exact check-in and penalty field contracts
- Participant-history preservation using `nohistory=0`

## Architecture

```text
Judge / Check-in / Admin browsers
                |
         trusted HTTPS :443
                |
             Caddy
                |
          HYFIT web app :4320
           /             \
   PostgreSQL :5432    Outbox worker
                           |
                    HTTPS POST/GET
                           |
                     RaceResult 14
```

The app, API routes, worker, database migrations, and UIs live in one
repository. The boundaries are:

- Browser clients communicate only with the HYFIT API.
- PostgreSQL is the authoritative store for locally accepted operational work.
- RaceResult calls are made centrally, never directly from judge devices.
- Accepted changes and their outbox operations commit in one database
  transaction.
- Internet loss may delay RaceResult convergence but must not erase accepted
  local work.
- Only Caddy should be exposed to field devices in a production LAN deployment.

## Technology

| Area | Technology |
|---|---|
| UI and API | React 19, TypeScript, Vinext/Next-compatible routes |
| Build runtime | Vite 8 and Vinext |
| Database | PostgreSQL 16 |
| Database access | `pg` and forward-only SQL migrations |
| QR scanning | `@zxing/browser` and browser camera APIs |
| Edge proxy/TLS | Caddy 2 |
| Container deployment | Docker Compose |
| Tests | Node test runner |

Node.js `22.13.0` or newer is required.

## Application URLs

When running locally on port `4320`:

| Application | URL |
|---|---|
| Judge App | <http://localhost:4320/> |
| Check-in App | <http://localhost:4320/checkin> |
| Admin Control | <http://localhost:4320/admin> |

Seeded development accounts use PIN `2468`:

| Role | Staff ID |
|---|---|
| Super Admin | `ADMIN` |
| Check-in Volunteer | `CHECKIN1` |
| Judge | `JUDGE1` |

The seed assigns `CHECKIN1` to `C01 · Main Gate`. These credentials are for
local development only. Change all PINs before using real participant data or
connecting an event endpoint.

## Fast setup with Docker Compose

This is the recommended setup for a new developer because it runs PostgreSQL,
migrations, the app, outbox worker, and Caddy consistently on macOS and Windows.

### Prerequisites

- Git
- Docker Desktop with Docker Compose
- At least 4 GB free memory for the development stack

### 1. Clone and configure

```bash
git clone https://github.com/novarace-india/hyfitgamesjudgeapp.git
cd hyfitgamesjudgeapp
cp .env.example .env
```

Edit `.env` and replace every development secret:

```text
POSTGRES_PASSWORD=choose-a-strong-local-password
SESSION_SECRET=replace-with-at-least-32-random-characters
APP_ORIGIN=https://hyfit.local
PORT=4320
```

`POSTGRES_PASSWORD` is used by Docker Compose. `DATABASE_URL` in `.env.example`
is for native development and does not override the internal container database
connection.

### 2. Build and start

```bash
docker compose up -d --build
docker compose ps
```

The `migrate` service applies every unapplied migration before the app and
worker begin normal operation.

### 3. Seed a fresh database

Run this only for a new development database:

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_PIN=2468 \
  app npm run db:seed
```

Seeding is idempotent for the included demo event and accounts, but it must
never be treated as production-user provisioning.

### 4. Trust local HTTPS

The included Caddy configuration serves `https://hyfit.local` with Caddy's
internal certificate authority. Add `hyfit.local` to local DNS or the workstation
hosts file, pointing to `127.0.0.1`.

The Caddy root certificate must be trusted by the workstation/browser. For
phones and tablets, it must be installed and trusted on every device. See
[HTTPS and device onboarding](docs/operations/HYFIT-local-network-race-day-runbook.md#4-https-and-mobile-camera-decision).

### 5. Stop or inspect

```bash
docker compose logs -f app worker
docker compose stop
```

Do not run `docker compose down -v` unless you intentionally want to delete the
PostgreSQL and Caddy volumes.

## Native development setup

Use native setup when working on the frontend/API with rapid reloads. PostgreSQL
and the RaceResult worker still need to run.

### macOS

Install prerequisites:

```bash
brew install node@22 postgresql@16 coreutils
brew services start postgresql@16
```

The verified build uses GNU `timeout`. Homebrew installs it through coreutils.
Put the GNU utilities first on the shell PATH:

Apple Silicon:

```bash
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
```

Intel Mac:

```bash
export PATH="/usr/local/opt/coreutils/libexec/gnubin:$PATH"
```

Create a local PostgreSQL user and database using your organisation's normal
database-administration process. Then:

```bash
git clone https://github.com/novarace-india/hyfitgamesjudgeapp.git
cd hyfitgamesjudgeapp
npm install
cp .env.example .env
```

Load the local environment and initialize the database:

```bash
set -a
source .env
set +a
npm run db:migrate
BOOTSTRAP_ADMIN_PIN=2468 npm run db:seed
```

Start the development server:

```bash
npm run dev
```

Run the worker in another terminal with the same `DATABASE_URL`:

```bash
set -a
source .env
set +a
npm run worker
```

### Windows

The recommended Windows environments are:

1. Docker Desktop for the complete stack; or
2. WSL 2 with Ubuntu, Node.js 22, PostgreSQL 16, and Git.

Run the Linux commands in WSL. Keep the repository inside the WSL filesystem
for better file-watching and build performance, for example
`~/projects/hyfitgamesjudgeapp`.

PowerShell alone is not the supported native script environment because the
repository build, backup, and helper scripts use Bash. Developers who do not use
WSL should use Docker Compose.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Native app/worker | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Docker Compose | Password for the Compose PostgreSQL user |
| `SESSION_SECRET` | Docker/deployment | Reserved deployment secret; keep strong even though current DB-backed tokens do not consume it yet |
| `PORT` | Optional | App port; defaults to the configured runtime port |
| `APP_ORIGIN` | Deployment | Reserved canonical HTTPS origin; origin enforcement is a pending hardening task |
| `DATABASE_POOL_SIZE` | Optional | App PostgreSQL connection-pool limit |
| `BOOTSTRAP_ADMIN_PIN` | Seed only | Temporary development PIN during seed |
| `HYFIT_BACKUP_DIR` | Optional | Backup output directory |
| `HYFIT_BACKUP_RETENTION_DAYS` | Optional | Local dump retention; default 14 days |

RaceResult participant and update endpoints are stored in a versioned event
configuration through Admin Control. Do not put the live RaceResult endpoint or
key in frontend source code.

Never commit:

- `.env` files;
- database passwords or session secrets;
- RaceResult endpoint keys;
- participant exports or database dumps;
- session cookies;
- TLS/private certificate keys;
- production screenshots containing participant information.

## Database lifecycle

### Migrations

Migrations live in `db/migrations/` and are applied alphabetically:

```bash
npm run db:migrate
```

Rules:

- Never edit a migration that has been applied or merged.
- Add a new, forward-only migration for every schema change.
- Make upgrades safe for an existing event database.
- Do not invent historical audit data during a migration.
- Include constraints and indexes that protect cross-device concurrency.
- Test migration from the current `main` schema and from a fresh database.

### Seed data

```bash
BOOTSTRAP_ADMIN_PIN=2468 npm run db:seed
```

The seed creates the development event, five sample participants, development
accounts, counter `C01`, and the `CHECKIN1` assignment.

### Backup and restore

Native backup:

```bash
npm run backup
```

Restore only into a controlled database:

```bash
bash scripts/restore.sh backups/hyfit-YYYYMMDDTHHMMSSZ.dump
```

The restore script verifies the adjacent SHA-256 file and uses `pg_restore
--clean`. It can overwrite database objects. Confirm `DATABASE_URL`, stop
application writes, and take a fresh backup before restoring.

## RaceResult 14 integration

Configuration is central and event-specific:

1. Sign in to Admin Control.
2. Open **Integration**.
3. Enter the complete participant GET endpoint.
4. Enter the complete participant-update POST endpoint.
5. Define participant and update JSON mappings.
6. Save and publish a new configuration version.
7. Select **Sync participants now**.
8. Review imported, inserted, updated, unchanged, and rejected counts.

### Participant import

The participant API must return JSON. Admin mapping supports nested dot paths
and maps at least:

- numeric BIB;
- participant name or name components;
- category;
- wave;
- source status;
- optional source ID.

RaceResult remains the master participant source. HYFIT stores the latest
normalized snapshot and does not silently delete participants absent from one
response.

### Check-in update contract

Successful local check-in queues exactly:

| RaceResult field | Value |
|---|---|
| `checkinstatus` | `1` |
| `wristbandid` | Scanned wristband ID |
| `Transponder1` | Scanned Transponder1 ID |

`Transponder1` is case-sensitive.

### Penalty update contract

Judging uses:

- `station1penalty`
- `station2penalty`
- `station3penalty`
- `station4penalty`
- `station5penalty`
- `station6penalty`
- `cognitiveskillpenalty`
- `cognitiveskillbonus`
- `station1ics` through `station6ics`
- `station1note` through `station6note`
- `Status`

Station 3 (Bear Crawl) is the only station with a time penalty: `10` seconds
for a knee touch. All stations default to penalty `0` and ICS `0`. Confirming
ICS writes the station ICS field as `1`, records the judge note, and writes
`Status=1` (Out of Competition).

Cognitive scoring always clears and writes both adjustment fields:

- 0–60%: penalty `30`, bonus `0`
- 61–99%: penalty `0`, bonus `0`
- 100%: penalty `0`, bonus `30`

The worker sends each field through POST using:

```text
<complete-update-endpoint>?bib=<BIB>&fieldname=<FIELD>&value=<VALUE>&nohistory=0
```

The URL is constructed safely with URL query parameters. `nohistory=0` preserves
RaceResult participant history.

Manual timing is a local backup record. Cognitive memorisation, six run splits,
six station splits, recall timing, and Finish Line timing are never posted to
RaceResult. Administrators can export this data from
`/api/judge/timing/export?format=csv` or `?format=json`.

### Outbox worker

Automatic delivery requires:

```bash
npm run worker
```

The worker:

- claims pending operations without concurrent duplication;
- posts to the currently published event endpoint;
- retries transient errors with exponential backoff;
- records attempts, errors, and confirmation times;
- marks exhausted updates as conflicts requiring operator attention.

Do not test with a real RaceResult endpoint or real BIB unless the event owner
has explicitly approved the mutation.

## Mobile QR and HTTPS

Browser camera APIs require a secure context. `localhost` may work during
desktop development, but a phone opening `http://<LAN-IP>:4320` will normally
not receive camera access.

For mobile scanning:

- serve the app over trusted HTTPS;
- ensure the hostname resolves to the event server;
- install/trust the local CA on managed devices, or use a publicly trusted
  certificate for an owned hostname;
- allow camera permission for the site;
- keep `Permissions-Policy: camera=(self)`.

Do not work around certificate failures by using HTTP for race-day QR scanning.

## Repository map

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Judge application workflow |
| `app/checkin/page.tsx` | Volunteer check-in workflow |
| `app/admin/page.tsx` | Event Control/Admin dashboard |
| `app/api/` | Authenticated server API routes |
| `app/qr-scanner.tsx` | Shared camera/QR scanner |
| `app/participant-sync.server.ts` | Participant-source synchronization logic |
| `app/penalties.ts` | Penalty field validation and queue helpers |
| `lib/auth.server.ts` | Session identity and role enforcement |
| `lib/db.ts` | PostgreSQL pool and transaction wrapper |
| `lib/participant-import.ts` | RaceResult normalization and validation |
| `lib/security.ts` | PIN, session-token, and cookie security |
| `db/migrations/` | Forward-only PostgreSQL migrations |
| `scripts/outbox-worker.mjs` | Durable RaceResult delivery worker |
| `scripts/migrate.mjs` | Migration runner |
| `scripts/seed-platform.mjs` | Development seed |
| `scripts/backup.sh` | PostgreSQL backup and checksum |
| `scripts/restore.sh` | Verified database restore |
| `tests/` | Node test suites |
| `public/branding/` | Runtime HYFIT Games logo assets |
| `ops/Caddyfile` | Local HTTPS and reverse proxy |
| `docker-compose.yml` | Complete local deployment |
| `docs/operations/` | Race-day infrastructure runbooks |
| `docs/superpowers/specs/` | Approved feature designs |

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Bounded verified production build |
| `npm start` | Start built production server |
| `npm run lint` | Run ESLint |
| `npm test` | Production build plus all Node tests |
| `node --test tests/*.test.mjs` | Run tests without rebuilding |
| `npm run db:migrate` | Apply unapplied SQL migrations |
| `npm run db:seed` | Seed development data |
| `npm run worker` | Run RaceResult outbox delivery |
| `npm run backup` | Create checksummed PostgreSQL dump |
| `npm run validate:artifact` | Validate built deployment artifact |

Before a pull request, run:

```bash
npm run lint
npm test
git diff --check
```

When a change includes a migration, also run it against a fresh development
database and an upgraded copy of the current development schema.

## Contribution workflow

### Branches

Start from an updated `main`:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Use focused branch prefixes such as:

- `feature/`
- `fix/`
- `docs/`
- `test/`
- `ops/`

Do not develop directly on `main`.

### Commits

Commits should be small enough to review and should explain the outcome:

```text
Add volunteer counter assignment audit
Fix Transponder1 RaceResult field casing
docs: document local HTTPS device setup
```

Avoid messages such as `changes`, `fix`, or `updates`.

Do not mix unrelated formatting, generated assets, schema changes, and behavior
changes in one commit.

### Pull requests

Every pull request should include:

- problem and intended behavior;
- affected Admin, Check-in, Judge, worker, or database areas;
- screenshots for visible UI changes;
- migration and backward-compatibility notes;
- RaceResult field/API impact;
- security, privacy, audit, and concurrency impact;
- commands and scenarios tested;
- rollback or recovery approach;
- documentation updated.

At least one reviewer should understand the affected operational workflow. A
database or RaceResult change requires a reviewer familiar with that boundary.

## Engineering invariants

Preserve these rules:

1. RaceResult is the external master system.
2. Locally accepted transactions must survive internet loss.
3. Check-in and penalty writes use the durable outbox.
4. APIs derive event, user, station, and session identity from authenticated
   server state—not trusted browser fields.
5. Every material action is attributable to an actor and server timestamp.
6. Historical audit evidence is appended, never silently rewritten.
7. Wristband and Transponder1 assignments are unique per active event.
8. One athlete cannot have two active judge sessions.
9. Final Finish makes that judge's athlete result read-only.
10. RaceResult field casing is part of the API contract.
11. Browser credentials, PINs, tokens, and endpoint secrets never enter logs or
    audit JSON.
12. Tests must not mutate a live RaceResult event.

## Troubleshooting

### A JavaScript asset returns 404

The production process is likely serving an older build manifest after a new
build replaced hashed assets.

1. Stop the running `npm start` process.
2. Run `npm run build`.
3. Start it again with `npm start`.
4. Hard-refresh the browser.

Never rebuild in place beneath a long-running production process without a
controlled restart.

### Login returns a network error

- Confirm PostgreSQL is running and `DATABASE_URL` is correct.
- Run `npm run db:migrate`.
- Confirm the user exists, is enabled, and belongs to the active event.
- Confirm the browser is using the current server URL.
- Inspect server logs; do not log the submitted PIN.

### Check-in says no counter is assigned

In Admin Control:

1. Create or enable a check-in counter.
2. Confirm the staff account has role `checkin`.
3. Assign that volunteer to the counter.
4. Reload the Check-in App.

### Participant sync fails

- Publish an event configuration with a complete GET endpoint.
- Verify the endpoint returns JSON.
- Confirm the participant mapping and numeric BIB field.
- Review rejected counts and the server-side sync error.
- Confirm only one sync is running.

### RaceResult updates remain pending

- Confirm `npm run worker` is running.
- Confirm the published update endpoint is complete.
- Confirm outbound HTTPS connectivity.
- Check Admin pending/conflict metrics and worker logs.
- Do not delete outbox rows to make the count disappear.

### Mobile camera does not open

- Use trusted HTTPS.
- Check browser and OS camera permission.
- Confirm no certificate warning is present.
- Close other applications using the camera.
- Test the rear camera on a prepared spare device.

### `npm run build` says GNU timeout is missing

- macOS: install `coreutils` and add its `gnubin` directory to PATH.
- Windows: build inside WSL 2 or Docker.
- Linux/Docker: confirm the `timeout` command from GNU coreutils is installed.

## Known limitations and priority hardening

Contributors should not assume that an environment variable or placeholder
Admin module is already enforced merely because its configuration exists.
Current priority areas include:

- enforce `APP_ORIGIN` for origin/host validation;
- incorporate or remove the reserved `SESSION_SECRET` configuration explicitly;
- add CSRF protection for state-changing browser requests;
- add login rate limiting and account lockout policy;
- complete operator views for audit history and conflict resolution;
- add automated participant-sync scheduling if event operations require it;
- expand database-backed integration tests beyond the existing unit and route
  contract tests;
- add controlled deployment health checks and process supervision for native
  non-Docker installations.

Security or audit hardening must preserve the existing local-first check-in and
judging behavior.

## Operational documentation

- [Local network and race-day runbook](docs/operations/HYFIT-local-network-race-day-runbook.md)
- [Local race-operations platform design](docs/superpowers/specs/2026-07-28-local-race-operations-platform-design.md)
- [Check-in station and audit design](docs/superpowers/specs/2026-07-28-checkin-station-raceresult-audit-design.md)
- [Participant integration design](docs/superpowers/specs/2026-07-28-raceresult-participant-integration-design.md)
- [Penalty update design](docs/superpowers/specs/2026-07-28-raceresult-penalty-update-design.md)
- [QR scanner runtime design](docs/superpowers/specs/2026-07-28-qr-scanner-and-logo-runtime-fix-design.md)
- [Cognitive reveal design](docs/superpowers/specs/2026-07-28-cognitive-sequence-reveal-design.md)

## First-day developer checklist

- [ ] Read this README and the local race-operations design.
- [ ] Clone the repository and create a personal feature branch.
- [ ] Start the Docker stack or complete native setup.
- [ ] Apply migrations and seed the development database.
- [ ] Sign in to Admin, Check-in, and Judge apps.
- [ ] Verify `CHECKIN1` shows `C01 · Main Gate`.
- [ ] Run participant lookup with a seeded numeric BIB.
- [ ] Run lint, production build, and all tests.
- [ ] Read the design document related to the assigned task.
- [ ] Confirm whether the task affects RaceResult, audit history, concurrency,
      mobile HTTPS, or race-day recovery.
- [ ] Agree on acceptance tests with the reviewer before implementation.
- [ ] Never connect the development worker to a live RaceResult endpoint without
      explicit event-owner approval.

## Ownership and support

Before sharing this repository, the project owner should add the current:

- technical lead;
- database/RaceResult integration owner;
- event-operations owner;
- security contact;
- pull-request reviewer group;
- incident/escalation channel.

Keep personal contact details out of the public repository if it becomes
publicly accessible. Use the organisation's maintained team directory instead.
