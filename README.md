# HYFIT Games Judge App

A responsive field-judging web application for HYROX-style events. The app
supports judge login, event and athlete pairing, timed cognitive preview,
six-station penalty capture, cognitive recall scoring and a consolidated result.

## Included

- Judge / Volunteer / Mobile ID entry
- Event selection and participant search
- Duplicate-assignment warning
- Timed R/G/Y cognitive sequence with explicit lettered tiles
- Six station workflow:
  1. Dumbbell Step-Ups
  2. Farmer's Carry
  3. Bear Crawl
  4. Burpees to Plate
  5. Front Carry + Air Squats
  6. Tyre Flips
- Quick and custom penalties with judge notes
- Position-by-position cognitive reveal, correctness percentage and below-60% penalty
- Final accumulated penalty summary
- Device-local autosave, offline indicator and recovery interface
- Responsive desktop/tablet/mobile design
- Print-friendly result summary

## Run on a Mac

### 1. Install Node.js

Install Node.js 22 or later from <https://nodejs.org>, or with Homebrew:

```bash
brew install node
```

Confirm the installation:

```bash
node --version
npm --version
```

### 2. Unzip and open the project

```bash
cd ~/Downloads
unzip HYFIT-Games-Judge-App-Source.zip
cd HYFIT-Games-Judge-App
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the app

```bash
npm run dev
```

Open the local address printed in Terminal, normally:

<http://localhost:5173>

Use any value as the Judge ID in this demonstration build.

## Production build

The included `npm run build` helper is intended for the hosted Linux build
environment. For everyday development on macOS, use `npm run dev`.

## Deploy on Railway

This repository includes a root-level [`railway.json`](./railway.json) for
repository-based deployment with Railway Railpack.

1. In Railway, create a new project and choose **Deploy from GitHub repo**.
2. Select this repository and deploy it from the repository root.
3. Railway will install dependencies, run `npm run build`, and start the app
   with `npm start`.
4. After the `/` health check passes, open the service settings and generate a
   public Railway domain.

No application environment variables are currently required. Vinext
automatically listens on Railway's injected `PORT` and binds to `0.0.0.0`.
Configuration in `railway.json` overrides conflicting build or deploy settings
in the Railway dashboard.

### Live participant API

The app uses numeric demo BIBs until `PARTICIPANT_API_URL` is configured. To
enable the open RaceResult participant feed, add these variables centrally to
the Railway service:

```text
PARTICIPANT_API_URL=https://example.com/live-participants
PARTICIPANT_LIST_PATH=data.participants
PARTICIPANT_BIB_FIELD=bib
PARTICIPANT_NAME_FIELD=name
PARTICIPANT_CATEGORY_FIELD=category
PARTICIPANT_WAVE_FIELD=wave
PARTICIPANT_STATUS_FIELD=status
PARTICIPANT_ID_FIELD=id
PARTICIPANT_SYNC_INTERVAL_MS=60000
```

Field values support dot paths for nested source records. Leave
`PARTICIPANT_LIST_PATH` empty when the API response itself is the participant
array. The server refreshes the source at most once per interval; judge devices
also retain the last successful snapshot for offline search.

### RaceResult penalty updates

Configure the complete RaceResult custom API endpoint centrally:

```text
RACERESULT_UPDATE_API_URL=https://api.raceresult.com/386828/YOUR_API_KEY
```

The server POSTs exact values to `station1penalty` through
`station6penalty` and `cognitiveskillpenalty`, always with `nohistory=0`.
Without this variable, local development runs in clearly identified demo mode.
Pending updates remain in a device-local retry queue, and Final Finish remains
locked until RaceResult confirms every field.

For Railway configuration details, see the official
[Config as Code](https://docs.railway.com/config-as-code) and
[Application Failed to Respond](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond)
documentation.

## Important production note

This package contains the complete interactive frontend demonstrated in the
deployed app. Participant data is currently sample data in `app/page.tsx`, and
active-race recovery uses browser storage.

Before using it for a live event with multiple devices, connect it to a central
backend providing:

- Excel judge and participant imports
- Secure ID authentication
- Central event and participant database
- Atomic judge-to-athlete assignment locks
- Server-side penalty and audit records
- Cross-device synchronization and conflict resolution
- Event-control dashboard and exports

## Main files

- `app/page.tsx` — application workflow and interaction logic
- `app/globals.css` — complete responsive visual design
- `app/layout.tsx` — document layout and metadata
- `package.json` — dependencies and commands

## Technology

React 19, TypeScript, Vinext/Next-compatible routing, Vite and Tailwind CSS.
