# Contest-Specific Bear Crawl Penalty Design

Date: 29 July 2026

Status: Approved design, pending written-spec review

## Objective

Remove the Station 3 Bear Crawl knee-touch penalty from the Judge and Manual
Timing workflows for RaceResult contests `1`, `2`, `3`, `4`, and `9`.
Cognitive recall penalty and bonus rules remain unchanged for every contest.

## Participant contract

Add a normalized participant `contestId`, sourced by default from the
case-sensitive RaceResult participant-feed field `ContestID`. The Admin
participant mapping may override the source path when required.

Persist the normalized value in a dedicated `participants.contest_id` column and
return it from participant, Judge lookup, claim, and timing-session interfaces.
Store it as text so the integration does not assume RaceResult IDs will always
remain numeric, while eligibility compares canonical trimmed values.

Existing participants receive an empty value during migration. Event Control
must run **Sync participants now** once after deployment to populate their
RaceResult `ContestID`.

## Eligibility rule

One shared function defines the exempt contest IDs:

```text
1, 2, 3, 4, 9
```

For those IDs:

- Station 3 shows only **No penalty** and **ICS**;
- the `+10 seconds` Bear Crawl control is absent;
- a crafted or stale client request attempting the Station 3 penalty is rejected
  by the timing API;
- no `station3penalty=10` RaceResult operation is created.

For every other contest ID, the current fixed maximum `+10 seconds` Station 3
penalty remains available.

An empty or unknown `ContestID` retains the current penalty option. This
fail-safe avoids granting an exemption because participant data has not yet
been synchronized.

## Cognitive scoring

The cognitive recall calculation is not contest-dependent:

- score less than or equal to 60% sends a 30-second cognitive penalty;
- score from 61% through 99% sends no adjustment;
- score of 100% sends a 30-second cognitive bonus.

No cognitive UI, field names, scoring, timing, or RaceResult behavior changes.

## Enforcement and audit

The browser uses the shared eligibility rule to render the correct Station 3
controls. The server resolves the participant and `contest_id` from its
authoritative race session before validating a station outcome. It never trusts
a client-supplied contest ID.

If an outdated or manipulated client submits a forbidden penalty, the API
returns a clear validation error and commits no split, outcome, audit, or outbox
change.

Existing historical Station 3 outcomes are not rewritten. The rule applies to
new stage completions after deployment.

## Verification

Tests cover:

- `ContestID` default and configurable participant mapping;
- import persistence and update classification;
- exempt IDs `1`, `2`, `3`, `4`, and `9`;
- a representative eligible ID;
- empty/unknown ID fail-safe behavior;
- hidden Station 3 penalty control for exempt participants;
- server rejection of a forbidden penalty;
- no Station 3 penalty outbox operation after rejection;
- unchanged ICS and cognitive scoring behavior;
- migration, lint, full test suite, production build, and authenticated local
  smoke testing.
