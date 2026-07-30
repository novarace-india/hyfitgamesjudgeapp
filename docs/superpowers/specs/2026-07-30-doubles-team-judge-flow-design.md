# Doubles Team Judge Flow Design

Date: 30 July 2026

Status: Approved conversational design, pending written-spec review

## Objective

Make the Judge app treat a Doubles pair as one operational race team while
preserving RaceResult's participant-level records and leaving every Singles
workflow unchanged.

A Doubles team performs the course together. The judge operates one clock, one
set of station outcomes, and one cognitive challenge for the pair. The final
team result is synchronized independently to both athlete BIBs.

## Authoritative Doubles contests

Doubles behavior is selected by the normalized RaceResult `ContestID`, not by
matching category text:

| ContestID | Contest name |
|---|---|
| `9` | Bloodline Doubles |
| `10` | Male Doubles |
| `11` | Female Doubles |
| `12` | Mixed Doubles |

All other ContestIDs use the existing Singles workflow. Contest names remain
display values and do not control operational behavior.

## Team identity

Each partner remains an individual participant with an individual participant
ID, BIB, QR code, wristband, transponder, check-in history, and RaceResult
record.

Within an authoritative Doubles contest, two participants form one team only
when they:

- belong to the same event;
- have the same ContestID;
- have the same normalized, nonempty `club` value; and
- have distinct participant IDs and BIBs.

Exactly two athletes must resolve for a valid team. Missing club data, a missing
partner, more than two matching athletes, or conflicting ContestIDs blocks
Judge pairing and directs the judge to Event Control. Check-in may continue to
display its existing non-blocking data warning because individual identity and
equipment handover remain per athlete.

## Singles isolation

The existing Singles behavior remains the default:

- one wristband scan or participant selection;
- one participant claim;
- one participant race session;
- one timing and cognitive flow; and
- RaceResult updates for that participant's BIB only.

No second scan, teammate lookup, team readiness control, shared session, or
two-BIB delivery is introduced for a participant outside ContestIDs 9–12.
Existing Singles API request forms remain accepted.

## Doubles pairing and readiness

The Judge app requires both wristband QR codes before creating a Doubles race
session:

1. The judge scans the first partner's active wristband.
2. The app shows that athlete and the expected registered teammate.
3. The judge scans the second partner's active wristband.
4. The server validates that the two distinct athletes form the registered
   Doubles team.
5. The server verifies that both athletes have authoritative local Stage 2
   completion and active wristband assignments.
6. The app displays both names, both BIBs, contest, team/club, and readiness.
7. The judge explicitly confirms that both athletes are present and ready.
8. The server atomically claims and locks both participants into one team race
   session.

Scanning the same wristband twice, an unrelated athlete, a partner from another
contest or club, an athlete without Stage 2, or an athlete in another active
session blocks the claim with one clear corrective instruction. No partial
claim is retained.

Manual participant search may initiate Doubles pairing, but it cannot bypass
the requirement to scan and validate both active wristbands.

## Shared race session

A Doubles race has one authoritative team session linked to exactly two
participant records and one judge.

The judge performs every operational action once:

- **Start:** tap when the first partner crosses the start line.
- **Runs and stations:** record each boundary once for the team.
- **Station outcome:** apply no-penalty, allowed penalty, or ICS once to the
  team.
- **Cognitive memorisation:** show one sequence once to both partners.
- **Cognitive recall:** record one shared response and calculate one shared
  score, penalty, or bonus.
- **Finish:** tap when the last partner crosses the finish line.

The official team elapsed time is therefore first partner start to last partner
finish. The app does not maintain separate manual clocks, splits, station
outcomes, or cognitive attempts for the two athletes.

Both athletes remain locked from other Judge assignments until the team session
is finished or Event Control performs an audited cancellation or recovery.

## Judge interface

After the first Doubles scan, the pairing screen clearly shows:

- first scanned athlete;
- expected teammate;
- a pending second-scan state; and
- why both scans are required.

After both scans, the confirmation screen shows both athletes with equally
prominent names and BIBs. The primary action reads **Confirm both athletes are
ready**.

During the race, every persistent identity rail shows:

- **Doubles team**;
- both athlete names;
- both BIBs;
- contest and team/club;
- one team clock; and
- one shared course state.

Copy uses plural/team terminology: “both athletes,” “team outcome,” “team
recall,” and “team result.” Singles screens retain their current singular copy.

The completion screen shows both athletes, the shared elapsed time, station
outcomes, ICS state, cognitive result, and the delivery state for each BIB.

## RaceResult fan-out

RaceResult remains participant-based. Every shared result field is delivered
separately to both BIBs with the same value:

- timing fields produced by the team timing contract;
- every station penalty;
- every station ICS value and note;
- overall status/OOC updates;
- cognitive penalty and bonus; and
- final completion values configured for the event.

Each BIB/field update has its own durable, idempotent outbox operation. The
operation key includes the team session/action, target participant, and field
so retries cannot duplicate or overwrite a newer action.

Local team completion does not wait for RaceResult. Delivery aggregation has
these visible states:

- **Confirmed:** every required operation for both BIBs is confirmed.
- **Pending:** at least one operation is awaiting delivery or retry.
- **Attention:** at least one operation conflicts or exhausts its allowed
  automatic recovery path.

If one athlete's updates succeed and the other's fail, the local team result
remains complete. The UI reports the partial state, for example:
**Team result saved · 1 of 2 RaceResult records pending**. Confirmed operations
are not resent unnecessarily; only outstanding operations retry.

## Data model

The database gains an explicit team-session relationship rather than
representing the race as two synchronized individual sessions.

The model must support:

- one race session with a Singles or Doubles mode;
- exactly two participant links for a Doubles session;
- a stable participant ordering for display and audit only, without making one
  athlete the scoring owner;
- participant-level active-session uniqueness across Singles and Doubles;
- shared splits, station outcomes, cognitive attempt, start, finish, and state;
- immutable snapshots of both athletes' IDs, BIBs, names, ContestID, contest
  name, club, wristbands, and transponders at claim time; and
- per-participant RaceResult delivery targets.

Team identity is derived and validated by the server from the synchronized
roster. Clients cannot submit an arbitrary teammate relationship, ContestID,
club, or readiness state.

## API behavior

Participant and wristband resolution includes enough team metadata for the
Judge UI to begin pairing, while the server remains authoritative.

The claim boundary accepts:

- the existing single `participantId` request for Singles; or
- two scanned wristband codes plus an explicit readiness confirmation for
  Doubles.

For Doubles, claim validation and both participant locks occur in one database
transaction. Timing actions continue to target the claimed race context; the
server derives both RaceResult targets from the session rather than trusting
client-supplied BIB arrays.

Timing snapshots return a discriminated Singles or Doubles identity model.
Existing Singles consumers continue to receive their compatible participant
identity.

## Failure and recovery

- **Wrong second athlete:** keep the valid first scan and request the registered
  teammate, with an option to restart pairing.
- **Duplicate scan:** explain that the other partner's wristband is required.
- **Missing or malformed team data:** block Judge pairing and route to Event
  Control.
- **Either Stage 2 incomplete:** identify the affected athlete and send the pair
  to Check-In/Event Control.
- **Either athlete already active:** block the whole claim; never claim only the
  available partner.
- **Claim response timeout:** idempotently return the already-created team
  session when the same claim is retried.
- **Device/server interruption during the race:** recover the one shared active
  team session with both athlete identities and the latest authoritative stage.
- **Partial RaceResult delivery:** retain the completed local result, show
  per-BIB delivery status, and retry only outstanding operations.
- **Cancellation or reassignment:** Event Control releases both athletes
  together through one audited team-session action.

## Testing and acceptance

Automated coverage must include:

- ContestIDs 9–12 select Doubles behavior and all other ContestIDs remain
  Singles;
- Singles claim, timing, cognitive, finish, and one-BIB delivery regressions;
- either Doubles partner may be scanned first;
- two correct wristbands resolve one team regardless of scan order;
- duplicate, wrong-team, wrong-contest, missing-club, missing-partner, and
  oversized-team rejection;
- both active wristbands and both local Stage 2 records are required;
- readiness confirmation is mandatory;
- both athletes are locked atomically with no partial claims;
- first-start and last-finish shared timing;
- one shared station outcome and ICS state;
- one shared cognitive sequence, response, and adjustment;
- identical RaceResult values fan out to both BIBs;
- idempotent per-BIB/per-field delivery;
- partial delivery, retry, conflict, and recovery states;
- shared active-session recovery after browser/device interruption;
- team cancellation releases both participants; and
- UI rendering consistently shows both names/BIBs for Doubles and unchanged
  singular identity for Singles.

Acceptance requires authenticated local smoke tests for one Singles athlete and
one valid Doubles pair from scan through final result, including a simulated
partial RaceResult delivery.

## Out of scope

- separate partner clocks, splits, station outcomes, or cognitive attempts;
- combining the two RaceResult participant records;
- allowing a judge to start a Doubles race after scanning only one athlete;
- changing the individual Check-In evidence or asset-assignment model;
- inferring Doubles behavior from contest-name text; and
- unrelated changes to published race rules or Singles presentation.
