# RaceResult Penalty Update and Undo Design

## Goal

Connect station and cognitive penalties to RaceResult's `part/savevalue` custom API, allow judges to revise or revoke penalties until Final Finish, and retain a read-only record of completed athletes on the judge's device.

This is the third integration project after participant sync and QR-based BIB lookup. It can be implemented before QR scanning because it uses the same normalized numeric BIB model.

## RaceResult Contract

Configure one Railway environment variable:

- `RACERESULT_UPDATE_API_URL`: the complete RaceResult custom API endpoint, for example `https://api.raceresult.com/386828/F7791UGI93Y0P9X65G35OMQZQDJP5Q9W`.

For every field update, the server sends an HTTP `POST` to that endpoint with URL query parameters:

- `bib`: the athlete's numeric BIB.
- `fieldname`: the approved additional-field name.
- `value`: the exact non-negative penalty value in seconds.
- `nohistory=0`: preserve the participant history record in RaceResult.

Any HTTP 2xx response means the update was accepted. Non-2xx responses, timeouts, and network failures remain retryable and must not be represented as saved.

## Allowed Fields

The server accepts only these field names:

- `station1penalty`
- `station2penalty`
- `station3penalty`
- `station4penalty`
- `station5penalty`
- `station6penalty`
- `cognitiveskillpenalty`

The client cannot supply arbitrary RaceResult field names. BIBs must contain digits only, and penalty values must be finite integers from 0 through 3600.

## Server Proxy

Add `POST /api/penalties` with a JSON request body:

```json
{
  "bib": "25645",
  "fieldName": "station1penalty",
  "value": 10,
  "operationId": "stable-client-generated-id"
}
```

The server validates the request, constructs the RaceResult URL with `URLSearchParams`, sends the POST, and returns:

```json
{
  "operationId": "stable-client-generated-id",
  "bib": "25645",
  "fieldName": "station1penalty",
  "value": 10,
  "savedAt": "2026-07-28T12:00:00.000Z"
}
```

If the update URL is not configured, the route operates in explicit demo mode and returns a successful simulated response marked `demo: true`. This keeps local development usable without silently pretending that a configured production failure succeeded.

Use a bounded upstream timeout and do not expose the configured endpoint or raw upstream response to the browser.

## Station Save and Revisit Flow

- Selecting a penalty changes only local draft state.
- Tapping **Save & continue** creates or replaces the queued exact-value update for that station.
- A zero value is also submitted, ensuring “No penalty” and revocations are persisted.
- The judge may continue when a write becomes pending; the outbox retries it in the background.
- Track `furthestStation` separately from the station currently being viewed.
- Completed and current station steps are selectable.
- Selecting an earlier step opens that station with its saved value and note.
- Saving an edited earlier station returns the judge to the furthest point already reached.
- A visible **Revoke penalty** action sets the station to zero and saves the update.
- Future stations remain inaccessible until reached sequentially.

## Cognitive Save

- The cognitive penalty remains editable while the recall result is open.
- On **Confirm recall & finish**, submit `cognitiveskillpenalty` with the selected penalty or `0` for a passing result.
- Do not lock the final result until every station field and the cognitive field has a confirmed RaceResult save.
- If writes are pending, show the affected fields and a **Retry now** action.
- Once all seven fields are confirmed, Final Finish locks the result.

## Retry Outbox

Maintain a versioned device-local outbox:

- Each operation contains `operationId`, numeric `bib`, approved `fieldName`, exact `value`, creation time, attempt count, and last error.
- Use one logical operation per BIB and field; a newer exact value replaces an older pending value for the same field.
- Retry on app startup, when connectivity returns, after a new operation is queued, and through a manual retry action.
- Use a bounded exponential delay during automatic retries.
- Because every write sets an exact field value, duplicate delivery is safe.
- Never remove an operation until the server confirms the same operation ID and value.

The current active-race snapshot stores per-field sync state so a reload restores saved, pending, and failed indicators.

## Read-Only Judged Athletes

After Final Finish:

- Save a compact completed result to a versioned device-local history.
- Record judge ID, athlete identity, completion time, each station penalty, cognitive score, cognitive penalty, notes, total penalty, and RaceResult save timestamps.
- Add a **Judged athletes** navigation item.
- List completed athletes newest first.
- Selecting one opens a read-only result showing exactly what that judge submitted.
- Completed results cannot be edited or resubmitted from this view.

This device history is a judge convenience and audit aid, not a replacement for RaceResult or a central database.

## Status and Error Presentation

Each field uses one of:

- `Draft`: changed locally but not saved.
- `Pending sync`: queued or retrying.
- `Saved`: RaceResult confirmed the exact current value.
- `Failed`: the most recent attempt failed and remains queued.

Use text and icons in addition to colour. Keep upstream technical errors out of the judge UI while logging them on the server.

## Testing

- Validate allowed fields, numeric BIBs, value limits, and operation IDs.
- Verify POST URL construction and `nohistory=0`.
- Verify 2xx success, timeout, and non-2xx handling.
- Test demo mode when the endpoint is absent.
- Test outbox replacement by BIB and field.
- Test retry retention and confirmed-operation removal.
- Test zero-value saves for no-penalty and revoke actions.
- Test station revisit rules and return-to-furthest behavior.
- Test Final Finish remains blocked until all seven fields are saved.
- Test completed history is read-only and includes every submitted penalty.
- Run lint, production build, and all existing tests.

## Out of Scope

- Editing a result after Final Finish.
- Central judged-athlete history across devices.
- RaceResult authentication.
- Bulk field updates.
- Participant QR camera scanning.
- Sending station notes to RaceResult.
