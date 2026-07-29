# Manual Timing, ICS, and Cognitive Race Console PRD

**Date:** 2026-07-29  
**Status:** Approved product design  
**Primary users:** Field judges and timekeepers, including 10th-grade students  
**Primary devices:** Tablets and mobile phones  
**External system:** RaceResult 14

## 1. Product objective

Create a guided manual race timing and judging console that acts as the event's
secondary timing system while also sending penalties, cognitive adjustments,
station completion details, and Out of Competition status changes to
RaceResult 14.

The application must:

- guide the operator through one fixed race sequence;
- record detailed split timing for every cognitive, run, and workout stage;
- capture station penalties and incomplete stations;
- automate cognitive recall timing and scoring;
- preserve a complete local audit and correction history;
- immediately synchronize scoring and status changes to RaceResult;
- never send the backup manual timing or split values to RaceResult;
- remain fast and understandable for a 10th-grade student working on the field;
- prioritize very large touch targets, short instructions, and tablet/mobile
  layouts.

## 2. User roles

### Judge/timekeeper

Selects and verifies a participant, starts the cognitive presentation, records
run and station completion, applies the Bear Crawl penalty or ICS, enters
required notes, and finishes the race.

### Athlete

Views the sequence during Cognitive Start and taps the large colour controls
during Cognitive Recall.

### Event administrator

Configures the event, cognitive sequence, RR14 endpoint and field mappings,
race definitions, users, and device assignments.

### Read-only operator

Reviews completed sessions, detailed splits, corrections, synchronization
state, and audit history.

## 3. Design principles for student operators

- Present only the current required action.
- Use one dominant primary button per stage.
- Make primary controls at least 56 CSS pixels high and preferably larger on
  tablets.
- Keep penalty, ICS, and completion actions spatially distinct.
- Use plain action language, for example **Complete 200 m Run** instead of
  internal timing terminology.
- Pair colour and icons with text; never rely on colour alone.
- Show the participant name and BIB persistently.
- Show the current stage, previous split, and next stage persistently.
- Provide concise instructional text immediately above the active controls.
- Acknowledge every accepted tap instantly.
- Disable controls after acceptance to prevent duplicate submissions.
- Avoid modal confirmations during normal forward progression.
- Require a clear confirmation only for consequential actions such as ICS,
  correction, takeover, or race cancellation.
- Support portrait mobile, landscape mobile, and tablet layouts without
  horizontal scrolling.
- Make cognitive colour controls large enough for rapid athlete input.

## 4. Race format

The application enforces this exact sequence:

1. Start Line
2. Cognitive Start
3. 200 m Run 1
4. Dumbbell Step-Ups
5. 200 m Run 2
6. Farmer's Carry
7. 200 m Run 3
8. Bear Crawl
9. 200 m Run 4
10. Burpees to Plate
11. 200 m Run 5
12. Front Carry + Air Squats
13. 200 m Run 6
14. Tyre Flips
15. Cognitive Finish
16. Finish Line

Forward progression is guided. A later stage cannot be recorded before its
prerequisite.

## 5. Timed workflow

### 5.1 Participant verification

The judge scans or enters a numeric BIB and verifies the participant. Only one
active timing session may exist for a participant in an event.

### 5.2 Cognitive Start

There is no countdown timer and no generic station-completion button.

The judge taps **Show Colours**. This single action atomically:

- records the race start timestamp;
- starts the total manual race clock;
- records the Cognitive Memorisation start;
- reveals the configured colour sequence;
- starts the Cognitive Memorisation segment.

The colours remain visible without an automatic timeout.

When the athlete confirms memorisation, the judge taps **Cognitive Memorise
Complete — Start Run**. This action atomically:

- records the Cognitive Memorisation completion split;
- calculates memorisation duration;
- hides the sequence;
- closes Cognitive Memorisation;
- opens 200 m Run 1 using the same boundary timestamp.

### 5.3 Runs and stations

Each run has a large **Complete 200 m Run** button. Acceptance closes the run
split and opens the following station using the same timestamp.

Each station has a large **Complete [Station Name]** button. The station outcome
must be selected before completion. Acceptance stores the split and outcome
atomically, then opens the next run.

### 5.4 Station 6 to Cognitive Recall

**Complete Tyre Flips** is one atomic boundary:

- record Station 6 completion;
- calculate Tyre Flips duration;
- close Station 6;
- open Cognitive Recall;
- use the same timestamp as Cognitive Recall start.

There is no separate **Begin Cognitive Recall** action.

### 5.5 Cognitive Recall

The athlete uses very large Red, Green, and Yellow buttons. The interface:

- accepts rapid consecutive taps without animation delay;
- acknowledges each valid tap visually;
- shows the filled response positions;
- provides a judge-controlled reset only before the tenth input;
- prevents duplicate final submission.

The tenth accepted colour tap atomically:

- records Cognitive Recall completion;
- calculates recall duration;
- locks the response;
- compares every position with the original sequence;
- calculates correct count and percentage;
- calculates penalty and bonus;
- stores the cognitive attempt and tap timestamps;
- queues both RR14 cognitive updates immediately;
- opens the Finish Line control.

There is no **Calculate**, **Submit**, **Next**, or **Complete Recall** action.

### 5.6 Finish Line

The judge taps **Finish Race** at the Finish Line. This records the finish split,
closes the final approach segment, stops the total manual timer, and opens the
result summary.

## 6. Timing boundaries

| Action | Closes | Opens |
|---|---|---|
| Show Colours | — | Total race and Cognitive Memorisation |
| Cognitive Memorise Complete — Start Run | Cognitive Memorisation | 200 m Run 1 |
| Complete 200 m Run | Current run | Following station |
| Complete Station 1–5 | Current station | Next 200 m run |
| Complete Tyre Flips | Station 6 | Cognitive Recall |
| Tenth recall colour tap | Cognitive Recall | Finish approach |
| Finish Race | Finish approach and total race | — |

Closing and opening stages share one timestamp so the timeline has no gaps or
overlaps.

Timing is calculated from stored timestamps, not browser interval counts.
Refreshes, device backgrounding, and temporary disconnection cannot reset the
clock.

## 7. Required splits

The local backup record contains:

- race start;
- Cognitive Memorisation completion;
- six 200 m run completions;
- six workout station completions;
- Cognitive Recall completion;
- Finish Line.

Each split stores:

- event and configuration version;
- participant and BIB;
- stage identifier and display name;
- cumulative elapsed time;
- duration since the previous boundary;
- local server timestamp;
- client-observed timestamp;
- judge/operator;
- device/session identifier;
- station outcome and notes, where applicable;
- idempotency key;
- original, corrected, or revoked revision state.

No manual timing or split field is posted to RaceResult.

## 8. Station outcomes and penalty rules

### Stations 1, 2, 4, 5, and 6

- **No Penalty**, selected by default
- **ICS — Incomplete Station**

### Station 3: Bear Crawl

- **No Penalty**, selected by default
- **+10 Seconds — Knee Touch**
- **ICS — Incomplete Station**

The Bear Crawl penalty is applied once and has a maximum of 10 seconds. Custom
station penalty values are not permitted.

### ICS

ICS requires a judge note before confirmation. The application records:

- participant and BIB;
- station and split;
- judge and device;
- reason/note;
- timestamp and cumulative time;
- previous station outcome when corrected.

ICS immediately queues:

- the station penalty as `0`;
- the station ICS marker as `1`;
- the station note;
- RR14 `Status=1`, meaning Out of Competition.

Timing continues through Finish Line for an OOC athlete. A persistent
**OOC — Incomplete Station** indicator appears on every remaining stage.

Revoking one ICS does not restore `Status=0` when another station still has ICS.
Status returns to `0` only after every station ICS marker has been revoked.

## 9. Cognitive scoring

The first release uses the existing ten-position Red/Green/Yellow sequence,
stored with the race configuration version.

| Correctness | Cognitive penalty | Cognitive bonus |
|---|---:|---:|
| 0–60% | 30 | 0 |
| 61–99% | 0 | 0 |
| 100% | 0 | 30 |

Every cognitive result updates both RR14 fields to clear stale values:

- `cognitiveskillpenalty`
- `cognitiveskillbonus`

Examples:

```text
60%  -> cognitiveskillpenalty=30, cognitiveskillbonus=0
80%  -> cognitiveskillpenalty=0,  cognitiveskillbonus=0
100% -> cognitiveskillpenalty=0,  cognitiveskillbonus=30
```

A supervised retest creates a new cognitive attempt and replaces both RR14
values with the latest approved result.

## 10. RaceResult fields and behavior

### Station fields

| Station | Penalty | ICS | Note |
|---|---|---|---|
| Dumbbell Step-Ups | `station1penalty` | `station1ics` | `station1note` |
| Farmer's Carry | `station2penalty` | `station2ics` | `station2note` |
| Bear Crawl | `station3penalty` | `station3ics` | `station3note` |
| Burpees to Plate | `station4penalty` | `station4ics` | `station4note` |
| Front Carry + Air Squats | `station5penalty` | `station5ics` | `station5note` |
| Tyre Flips | `station6penalty` | `station6ics` | `station6note` |

### Status

The application uses the standard RR14 `Status` field:

- `0`: Regular
- `1`: Out of competition
- `2`: DSQ
- `3`: DNF
- `4`: DNS
- `5`: Did not show up

### Station action writes

- Normal completion: penalty `0`, ICS `0`, note empty.
- Bear Crawl knee touch: penalty `10`, ICS `0`, optional note.
- ICS: penalty `0`, ICS `1`, required note, and `Status=1`.
- ICS revoked: ICS `0` and corrected/empty note; recompute whether `Status`
  remains `1` or returns to `0`.

All scoring writes use the published `part/savevalue` Custom API contract with
one BIB and one field per HTTP POST:

```text
bib=<numeric BIB>
fieldname=<field>
value=<value>
nohistory=0
```

Related field writes belong to one action group. The browser never receives the
RR14 URL or secret.

## 11. Synchronization states

The UI distinguishes:

- Saving locally
- Updating RaceResult
- RaceResult confirmed
- Offline — saved locally and retrying
- Partial update — retrying remaining fields
- Needs attention

The judge never manually initiates synchronization. RR14 delivery begins after
the local commit and retries automatically.

If RR14 or the internet is unavailable:

- timing and judging continue;
- the durable outbox retains every field update;
- retries use bounded backoff;
- pending fields remain visible;
- the UI never claims confirmation early.

If the local server is unreachable, the device stores the action with its
operation ID and observed timestamp, then reconciles automatically when the
server returns.

## 12. Idempotency, ordering, and concurrency

- Every button action has a stable idempotency key.
- Only one active race session may exist per event and participant.
- Only one process may deliver an RR14 operation at a time.
- Related action writes expose aggregate status without hiding partial failure.
- Operations for the same BIB and field are delivered in intent order.
- An older retry cannot overwrite a newer confirmed correction.
- Duplicate taps cannot create duplicate splits, station outcomes, cognitive
  attempts, or RR14 operations.
- Administrative takeover of an active participant requires a reason and audit
  event.

## 13. Corrections

Authorized corrections include:

- wrong-stage split;
- accidental stage completion;
- station penalty;
- ICS selection or revocation;
- station note;
- full supervised cognitive retest.

Corrections are append-only and require a reason. The audit record retains the
original value, corrected value, operator, timestamps, and RR14 operations.

Completed timing records are never destructively overwritten.

## 14. Active race interface

The main screen shows:

- participant name and BIB;
- OOC indicator when applicable;
- current stage and simple instruction;
- cumulative race time;
- current-stage time;
- previous split;
- next stage;
- one dominant completion action;
- allowed outcome controls;
- local-server state;
- RR14 synchronization state.

### Responsive behavior

#### Mobile portrait

- single-column stage card;
- sticky participant/timer header;
- primary action fixed near the bottom safe area;
- outcome controls stacked or arranged in a two-column grid;
- minimum touch target of 56 by 56 CSS pixels.

#### Tablet portrait or landscape

- timing/status summary beside the active stage;
- primary action spans the active control region;
- cognitive buttons fill the available width and height;
- no critical action is placed in a narrow sidebar.

The interface must remain usable outdoors with high contrast and short labels.

## 15. Result summary and export

The completed result shows:

- race start and Finish Line timestamps;
- total elapsed time;
- every cumulative split and stage duration;
- Bear Crawl penalty;
- ICS stations and notes;
- OOC status;
- cognitive sequence, response, individual tap timestamps, score, penalty, and
  bonus;
- memorisation and recall durations;
- RR14 synchronization state;
- correction history.

Administrators can export completed timing data as CSV and JSON, including raw
timestamps, calculated durations, outcomes, notes, audit metadata, and sync
states.

Automated import of manual timing back into RR14 is outside this release.

## 16. Core data records

- `race_sessions`: participant, judge, device, configuration, state, current
  stage, start/finish, and OOC state.
- `race_stage_events`: append-only stage openings, completions, and corrections.
- `race_splits`: accepted boundaries with client/server timestamps and
  calculated durations.
- `station_outcomes`: penalty, ICS, notes, and revision history.
- `cognitive_attempts`: sequence, response, tap timestamps, score, adjustment,
  and durations.
- `outbox_operations`: individual RR14 field writes and action group.
- `audit_events`: operator, action, entity, old/new values, reason, and time.

## 17. Performance requirements

- Local control acknowledgement target: under 100 ms.
- Capture the observed split timestamp before rendering the next stage.
- Cognitive controls must not drop taps at normal rapid human speed.
- Next cognitive input readiness target: under 50 ms.
- RR14 delivery starts immediately after local acceptance.
- RR14 outage never blocks manual timing.
- Refresh recovery restores stage and elapsed time from durable timestamps.

## 18. Functional acceptance criteria

1. A student judge can complete the race using only the currently presented
   action and its supporting text.
2. **Show Colours** starts total race and Cognitive Memorisation timing.
3. Cognitive Memorisation has no countdown or automatic timeout.
4. Memorisation completion records its split and opens Run 1.
5. Every run and station records cumulative and segment time.
6. Completing Tyre Flips closes Station 6 and starts Cognitive Recall with one
   timestamp.
7. The tenth recall tap closes recall, scores, and posts both cognitive fields.
8. Only Bear Crawl permits the fixed 10-second penalty.
9. Every station defaults to No Penalty and supports ICS.
10. ICS requires a note, stores full details, and sets `Status=1`.
11. OOC athletes continue through all remaining timing stages.
12. Manual timing never enters an RR14 request.
13. RR14 outage does not stop timing or judging.
14. Pending RR14 operations retry without judge action.
15. Duplicate taps cannot create duplicate effects.
16. Corrections preserve original observations and reasons.
17. Completed races export with all splits and audit data.
18. Mobile and tablet layouts have no horizontal scrolling and retain large
    primary controls.

## 19. Required validation scenarios

- Normal race with no penalties.
- Bear Crawl knee-touch penalty.
- ICS at each station.
- Multiple ICS stations followed by selective revocation.
- Cognitive results at 60%, 70%, and 100%.
- Ten rapid recall taps.
- Double tap on every completion action.
- Refresh during every stage.
- Mobile portrait, mobile landscape, tablet portrait, and tablet landscape.
- Device Wi-Fi loss and local-server recovery.
- RR14 outage and later reconciliation.
- Two judges claiming the same BIB.
- Split correction and cognitive retest.
- CSV/JSON reconstruction of total and every segment.

## 20. Out of scope

- Sending manual timing or splits to RR14
- Automatic replacement of official RR14 timing
- Arbitrary station ordering
- Custom Bear Crawl penalty values
- Bulk participant updates in one RR14 request
- Destructive editing of original timing observations
