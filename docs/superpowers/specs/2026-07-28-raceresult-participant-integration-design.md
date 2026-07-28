# RaceResult Participant Integration Design

## Goal

Create a centrally configured participant integration that periodically fetches live RaceResult data, normalizes it into the judge app's participant model, and keeps a device-local snapshot available for manual and future QR-based BIB lookup.

This is the first of three related projects:

1. Participant integration and local sync.
2. Numeric-BIB QR scanning and participant pairing.
3. Penalty submission to RaceResult with retries and audit status.

## Architecture

Use a server-side participant proxy backed by a short-lived in-memory cache and a device-local browser snapshot:

1. The Vinext server reads RaceResult configuration from Railway environment variables.
2. The server fetches the open RaceResult participant API.
3. A normalization layer maps configurable source fields into the app's stable participant model.
4. The server caches the normalized result for 60 seconds to avoid a source request for every judge search.
5. Judge devices request `/api/participants`, update their local snapshot, and build a BIB/name search index.
6. When the network or RaceResult is unavailable, the device continues using its last successful snapshot and clearly shows its age.

The current demo participant list remains a fallback when `PARTICIPANT_API_URL` is not configured.

## Central Configuration

Configure the integration once for the Railway service:

- `PARTICIPANT_API_URL`: complete HTTPS endpoint for the open participant feed.
- `PARTICIPANT_LIST_PATH`: optional dot path to the array inside the JSON response; an empty value means the response root is the array.
- `PARTICIPANT_BIB_FIELD`: source field containing the numeric BIB.
- `PARTICIPANT_NAME_FIELD`: source field containing the participant display name.
- `PARTICIPANT_CATEGORY_FIELD`: source field containing the race category.
- `PARTICIPANT_WAVE_FIELD`: source field containing wave/start information.
- `PARTICIPANT_STATUS_FIELD`: source field containing assignment/readiness status.
- `PARTICIPANT_ID_FIELD`: optional stable RaceResult participant identifier for future result submission.
- `PARTICIPANT_SYNC_INTERVAL_MS`: server cache lifetime, default `60000`.

No credentials or authentication configuration are required because the source is an open API.

## Normalized Participant Model

Each record returned to the judge app contains:

- `id`: stable source identifier when available; otherwise the normalized BIB.
- `bib`: numeric BIB represented as a string so leading zeros are preserved.
- `name`: participant display name.
- `category`: normalized category label.
- `wave`: normalized wave/start label.
- `avatar`: initials derived from the display name.
- `status`: `Ready` or `On course`.

Records with an absent or non-numeric BIB are rejected from the normalized list and counted in sync diagnostics. Duplicate BIBs are also rejected and reported because QR and manual pairing require BIB uniqueness.

## Server API

`GET /api/participants` returns:

```json
{
  "participants": [],
  "sync": {
    "source": "raceresult",
    "fetchedAt": "2026-07-28T12:00:00.000Z",
    "expiresAt": "2026-07-28T12:01:00.000Z",
    "rejectedCount": 0,
    "stale": false
  }
}
```

When no source URL is configured, it returns the numeric demo participants with `source: "demo"`.

The server should reuse a fresh in-memory response. When the cache is expired, only one refresh request may be active; concurrent requests await the same refresh rather than issuing duplicate RaceResult calls.

## Device Sync and Offline Behavior

- Fetch participants when the athlete-search screen opens.
- Refresh every 60 seconds while the search screen remains active.
- Provide a visible `Sync now` action.
- Save every successful normalized response to a versioned local-storage entry.
- Load the saved snapshot immediately on app startup so manual and future QR lookup work before the first network refresh completes.
- Replace the snapshot only after a complete, valid server response.
- Display `Live`, `Last synced <time>`, or `Offline · using data from <time>`.
- Never clear a usable snapshot because a later refresh failed.

## Search Integration

- Manual search continues to match participant name and numeric BIB.
- Exact BIB matches rank before partial BIB or name matches.
- The future QR scanner will call the same exact-BIB lookup function.
- Selecting a participant continues into the existing verification and pairing screen.
- An `On course` participant remains blocked from pairing and retains the existing Control Desk message.

## Error Handling

- Use a bounded timeout for the upstream RaceResult request.
- Return a structured error with an appropriate HTTP status when no server cache is available.
- If an expired server cache exists, return it with `stale: true` rather than failing the judge workflow.
- Reject malformed payloads, invalid list paths, invalid BIBs, and duplicate BIBs with diagnostic counts while avoiding exposure of raw upstream data.
- Surface concise judge-facing messages while keeping technical details in server logs.

## Testing

- Unit-test configurable dot-path extraction and field mapping.
- Unit-test numeric BIB normalization, including leading zeros.
- Unit-test rejection of invalid and duplicate BIBs.
- Unit-test name-to-initial conversion and status normalization.
- Test fresh-cache reuse and single-flight refresh behavior.
- Test demo fallback with no configured URL.
- Test stale server-cache fallback when the upstream request fails.
- Test device snapshot restoration and exact-BIB-first search ordering.
- Run lint, production build, rendered HTML tests, and the existing cognitive tests.

## Out of Scope

- QR camera access and decoding.
- Penalty/result POST submission.
- Authentication or secrets.
- A central participant database.
- Cross-instance cache coordination.
- Event-control configuration UI.
