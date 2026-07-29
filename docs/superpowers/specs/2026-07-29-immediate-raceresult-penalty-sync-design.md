# Immediate RaceResult Penalty Synchronization Design

**Date:** 2026-07-29  
**Status:** Approved for implementation planning

## Goal

Deliver every judge penalty change to RaceResult 14 immediately after the
corresponding Judge App action, while retaining durable automatic recovery when
RaceResult cannot be reached.

The judge must not need to start, monitor, or manually retry synchronization.
The interface may continue after a confirmed RaceResult response. When delivery
cannot be confirmed because the connection is unavailable, the accepted action
remains visibly pending and retries automatically.

## RaceResult contract

The published event configuration supplies the complete RaceResult Custom API
URL. The Custom API in RaceResult must use:

```text
part/savevalue
```

Each request updates one field for one participant. HYFIT sends an HTTP `POST`
to the configured URL with these query parameters:

```text
bib=<numeric BIB>
fieldname=<approved field name>
value=<non-negative integer seconds>
nohistory=0
```

`nohistory=0` preserves the change in RaceResult participant history.

The approved penalty fields remain:

- `station1penalty` through `station6penalty`
- `cognitiveskillpenalty`

Zero is a real update. Selecting **No penalty** or revoking an existing penalty
must send `value=0`.

Reference:
[RaceResult Update Fields](https://www.raceresult.com/en/support/kb?id=10385-Update-Fields)

## Architecture

Immediate delivery and durable recovery share one server-side delivery module.
The module owns URL construction, the HTTP request, timeout behavior, response
validation, and outbox state transitions. The API route and background worker
must call this module rather than maintaining separate request implementations.

The browser never receives the configured RaceResult URL and never calls
RaceResult directly.

### Immediate path

For every penalty-affecting Judge App action:

1. The browser creates a stable operation ID and calls `POST /api/penalties`.
2. The server validates the BIB, field, value, authenticated judge, and active
   race session.
3. In one database transaction, the server records the append-only penalty
   event, audit event, and durable outbox operation.
4. After the transaction commits, the server immediately claims that outbox
   operation and attempts the RaceResult POST.
5. A successful RaceResult HTTP response marks the outbox operation
   `confirmed`, records `confirmed_at`, and returns a confirmed response to the
   browser.
6. The Judge App shows **RaceResult confirmed** and proceeds without manual
   intervention.

The database transaction must not remain open during the external HTTP call.

### Connectivity-failure path

If RaceResult cannot be reached, the request times out, or RaceResult returns a
server failure:

1. The accepted local penalty and outbox operation remain durable.
2. The server moves the outbox operation to `failed` with the attempt count,
   next retry time, and sanitized error.
3. The API returns an accepted-but-pending response instead of discarding the
   judge action.
4. The Judge App shows **Offline · retrying** or **RaceResult unavailable ·
   retrying**.
5. The background worker retries automatically with bounded exponential
   backoff.
6. Once confirmed, the durable operation is marked `confirmed`.

The judge does not press a retry button. A pending synchronization does not
erase or duplicate the locally accepted penalty.

## Idempotency and concurrency

The client-generated operation ID remains the unique `operation_key`. Repeating
the same API request must resolve the existing operation instead of inserting a
second logical update.

Only one process may deliver an outbox operation at a time. Both the immediate
request path and worker must atomically claim eligible operations before
delivery. A stale `processing` operation must become retryable after a bounded
lease period so a crashed process cannot strand it permanently.

Changing the same BIB and field again creates a new operation and a new
append-only penalty event. Operations are delivered in creation order per event,
BIB, and field so an older retry cannot overwrite a newer confirmed value.

## User-interface behavior

Selecting a penalty changes draft state only. These actions save and immediately
trigger RaceResult delivery:

- **Save & continue**
- **Revoke penalty**
- saving **No penalty**
- **Confirm recall & finish**

The field status meanings are:

- **Saving…** — local acceptance or immediate RaceResult request is in progress.
- **RaceResult confirmed** — RaceResult returned a successful HTTP response.
- **Offline · retrying** — the local action is durable but RaceResult delivery
  is pending.
- **Sync needs attention** — automatic retries reached the conflict threshold.

The UI must never label a locally queued operation as RaceResult-confirmed.
Successful actions proceed automatically. A connectivity failure does not
discard the judge's work; it leaves the synchronization visibly pending and
allows the workflow to continue under the existing offline-first operating
model.

Final Finish records the local race completion after all seven penalty intents
have been durably accepted. It should not falsely claim RaceResult confirmation
for pending fields. Pending fields continue retrying after local finish.

## Deployment behavior

The application performs immediate delivery itself, so normal penalty updates
do not depend on the worker poll interval.

The outbox worker remains required for outage recovery. The production
deployment must start it automatically and restart it after failure. Local
development and race-day documentation must state that `npm run worker` is
required when the app is not launched through Docker Compose.

## Error handling

- Missing or invalid published update URL: retain the operation and report a
  configuration error requiring admin attention.
- Network error or timeout: retain and retry automatically.
- RaceResult `5xx`: retain and retry automatically.
- RaceResult `4xx`: retain the audit trail and mark the operation as requiring
  attention because retrying the same invalid request is unlikely to succeed.
- Malformed configured URL: treat as a configuration conflict without exposing
  the URL or its credential in browser responses or logs.
- Process crash during delivery: recover the operation through the processing
  lease.

Logs and API responses must not expose the configured Custom API URL or its
secret token.

## Verification

Automated tests must cover:

1. Correct `POST` construction for BIB, field name, value, and `nohistory=0`.
2. Immediate success marks an operation confirmed and returns confirmation.
3. Zero-value save and revoke operations reach RaceResult.
4. Timeout and network failure retain an automatically retryable operation.
5. Worker retry confirms a previously failed operation.
6. Duplicate operation IDs do not create duplicate penalty or audit intent.
7. Concurrent immediate and worker claims cannot deliver the same operation.
8. Updates to the same BIB and field preserve ordering.
9. Invalid or missing published configuration becomes visible without leaking
   credentials.
10. The Judge App distinguishes confirmed, pending, and attention states.

Manual verification should use a controlled mock endpoint first. A live
RaceResult test requires an event-owner-approved test BIB and field, followed by
verification in RR14 participant history.

## Out of scope

- Bulk updates of multiple BIBs in one RaceResult request
- Browser-to-RaceResult requests
- Changes to penalty values or judging rules
- Participant import behavior
- Replacing the durable outbox with an in-memory retry queue
