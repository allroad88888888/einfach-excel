# Public comparison evidence maintenance

This document defines how public comparison evidence is reviewed, marked
stale, and withdrawn. It is a maintenance procedure, not a comparison table or
result. It records no competitor fact, performance figure, service objective,
or favorable or unfavorable conclusion.

## Scope

The procedure applies to every public statement that relies on a source about a
comparison subject. A statement is publishable only while its supporting record
is current under this procedure. It does not choose comparison dimensions,
collect source material, or decide comparison conclusions.

Each supporting record must contain:

| Record field               | Required content                                                 |
| -------------------------- | ---------------------------------------------------------------- |
| Evidence identifier        | Stable identifier for the individual evidence record             |
| Public statement reference | Exact public location that relies on the record                  |
| Source locator             | Primary source URL or immutable artifact locator                 |
| Source version             | Version, revision, release date, or explicit absence of one      |
| Verification date          | Calendar date on which the source was checked                    |
| Evidence verifier          | Named person or accountable role that performed the check        |
| Maintenance owner          | Named person or accountable role responsible for the next review |
| Review state               | Current, due, stale, withdrawn, or replaced                      |
| Review log                 | Date, reviewer, outcome, and next scheduled review date          |

A record without a source locator, verification date, verifier, maintenance
owner, or review state is incomplete. An incomplete record cannot support a
public comparison statement.

## Review schedule

The maintenance owner must review every current record at least once every
90 calendar days from its verification date or most recent successful review,
whichever is later. The review log must record the review date, reviewer,
outcome, and next due date. A record that reaches its due date without a
successful review becomes stale at the start of the following calendar day.

The owner must also begin a review when any of these triggers is observed:

- the cited source changes, disappears, redirects without preserving the cited
  content, or becomes inaccessible;
- the source publishes a new applicable version, release, revision, or policy;
- the cited subject changes its release, edition, licensing, support, or other
  documented condition relevant to the statement;
- the public statement is moved, edited, translated, or reused in a new
  context;
- a reader, maintainer, or source owner reports that the record may be
  inaccurate, incomplete, or no longer applicable.

Opening a review does not extend the existing record's freshness. The record
remains current only until its scheduled expiry or an invalidation trigger,
whichever comes first.

## Stale and withdrawal procedure

When a source version, source locator, or statement scope is invalidated, the
maintenance owner must complete the following procedure before the affected
statement can remain public:

1. Mark the supporting record `stale` and record the trigger, date, and person
   who observed it.
2. Mark every public statement that relies on the stale record as unsupported
   in the maintenance record.
3. Withdraw the affected statement or replace it with a non-comparative notice
   that the evidence is under review. Do not preserve an unverified conclusion
   as a historical, neutral, or provisional comparison.
4. Record the withdrawal location, responsible owner, and the evidence needed
   to reopen review.
5. Obtain a new or reverified source, record its version and verification date,
   then have a verifier confirm that it supports the exact public statement.
6. Replace the stale record only after the maintenance owner records the
   successful review and a new next due date. Re-publish only the statement
   supported by that current record.

If re-verification cannot be completed, the record remains `withdrawn`; it
must not be relabeled `current` merely because no contrary source was found.

## Responsibility and audit trail

The maintainer opening a public comparison statement must create its supporting
record and name its maintenance owner. The evidence verifier checks the cited
source; the maintenance owner schedules reviews, starts withdrawal when needed,
and records the outcome. One person may hold more than one role, but the record
must name each responsibility explicitly.

Every review, stale marking, withdrawal, replacement, and republication must
append a dated audit entry with the actor, affected evidence identifier, public
statement reference, decision, and reason. The audit trail must preserve the
fact that a statement was withdrawn without retaining the withdrawn comparison
as an active conclusion.

## Completion checklist

- Every public comparison statement has exactly identified supporting records.
- Each record names a verifier and maintenance owner.
- The last review and next due date are recorded.
- Every invalidation trigger has either an active review or a completed audit
  entry.
- Stale or incomplete records have no active public comparison conclusion.
- A replacement record was independently verified before any republication.

## Boundary

This procedure does not define the field vocabulary for comparison entries,
source-collection work, publication layout, measurement methods, or the rules
for drawing a comparison conclusion. Those decisions remain with their
respective issue leaves. This file only governs the continued validity of
already referenced public comparison evidence.
