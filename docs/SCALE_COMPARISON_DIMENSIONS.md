# Scale comparison dimensions

This document defines the evidence-aware field schema for comparing scale and
architecture. It is a schema, not a comparison result. It contains no
competitor fact, measurement, capacity statement, performance figure, or
product conclusion.

## Purpose and boundary

A comparison entry must make its subject, field, evidence, scope, and
verification date independently inspectable. An empty field remains empty:
missing evidence must never be expressed as a neutral, favorable, or
unfavorable conclusion.

This schema separates three kinds of input:

1. **Source mechanism facts** describe a current implementation mechanism.
   They establish neither observed cost nor an advantage over another product.
2. **Reproducible measurements** record observations from a defined scenario.
   They are comparable only when the scenario and environment are compatible.
3. **Verified competitor facts** record a dated, attributable statement about
   a named comparison subject. They do not establish equivalence with this
   project's mechanisms or measurements.

The schema does not turn an architecture description into a performance claim,
and it does not infer missing facts from a product's documentation, package
list, or absence of a contrary statement.

## Required entry fields

Every populated comparison cell uses the following field groups.

| Field group   | Required fields                                                                         | Rule                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Identity      | subject, dimension, exact claim or observed value                                       | Name the comparison subject and one dimension without combining unrelated mechanisms. |
| Evidence      | evidence level, source locator, source version or revision, verifier, verification date | A reader must be able to locate the evidence that was checked on the stated date.     |
| Scope         | workload or feature scope, included paths, exclusions, assumptions                      | State the boundary that makes the fact true; do not generalize beyond it.             |
| Comparability | protocol identifier, dataset shape, environment, relevant configuration                 | Required for a measurement-based comparison; incompatible entries remain un-compared. |
| Disclosure    | limitation, uncertainty, missing inputs, expiry or recheck trigger                      | Missing or stale evidence is disclosed rather than filled with an inference.          |

`verification date` is the date on which the cited source or artifact was
checked, not the date a document was first written. If a version, revision, or
stable source locator is unavailable, the entry is incomplete and cannot
support a comparison conclusion.

## Dimensions

The comparison uses the dimensions below. A dimension can describe a mechanism
without asserting that the mechanism is better, faster, smaller, or suitable
for a particular scale.

| Dimension                    | What an entry may record                                                                                     | Internal mechanism evidence                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Stored-record representation | How stored records are indexed or traversed; geometric blanks that are excluded from stored-record traversal | [Sparse storage model](SPARSE_STORAGE_MODEL.md), [scale facts](SCALE_FACTS.md)                 |
| Range dependency selection   | Which dependency shape is selected from normalized range geometry; applicable fallback boundary              | [Range dependency tiers](RANGE_DEPENDENCY_TIERS.md), [scale facts](SCALE_FACTS.md)             |
| Display projection boundary  | Request/result ownership, validation, rectangle scope, and explicitly excluded ownership                     | [Projection boundary contract](PROJECTION_BOUNDARY_CONTRACT.md), [scale facts](SCALE_FACTS.md) |
| Range command boundary       | When a command retains a rectangle or refuses unavailable oversized address expansion                        | [Boundedness contracts](BOUNDEDNESS_CONTRACTS.md), [scale facts](SCALE_FACTS.md)               |
| Evaluation trigger           | Conditions under which evaluation is requested or deferred within the documented contract                    | [On-demand evaluation](ON_DEMAND_EVALUATION.md)                                                |
| Cross-sheet evaluation path  | The documented routing boundary for evaluation across sheets                                                 | [Cross-sheet evaluation](CROSS_SHEET_EVALUATION.md)                                            |
| Layer ownership              | The boundary between storage, dependency selection, projection, and range-native commands                    | [Scale architecture](SCALE_ARCHITECTURE.md), [scale facts](SCALE_FACTS.md)                     |

The named dimensions are a field vocabulary. They are not a scorecard, ranking,
or implied feature matrix. A claim that does not fit one dimension must not be
forced into the table; define and review a separate dimension first.

## Evidence levels

| Level | Input                       | Minimum record                                                                                             | It can support                                             | It cannot support by itself                                       |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| E0    | Missing or unverified input | Dimension and the explicit missing-data state                                                              | A request for evidence                                     | Any comparison statement                                          |
| E1    | Source mechanism fact       | Current revision, precise internal locator, scope, verifier, verification date                             | A source-backed description of this repository's mechanism | A measured cost, capacity, competitor fact, or advantage          |
| E2    | Reproducible measurement    | Scenario, dataset shape, environment, command or procedure, raw artifact, revision, verification date      | A bounded observation for that scenario                    | A cross-subject conclusion without compatible evidence            |
| E3    | Verified competitor fact    | Named subject, primary attributable source, applicable version or date, verifier, verification date, scope | A dated statement about that subject                       | A claim that it behaves identically under this project's scenario |
| E4    | Comparison conclusion       | Compatible E2 and/or E3 inputs, stated comparison rule, limitations, verifier, verification date           | A qualified conclusion limited to its evidence             | A universal, timeless, or unsupported claim                       |

E1 evidence for this repository begins with the internal documents linked in the
dimension table. Those documents describe current facts and contracts. They do
not replace a reproducible measurement.

## Completion gates

The issue leaves populate this schema in order:

| Gate                   | Responsible leaves                            | Permitted output                                                               |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Competitor evidence    | AD-815 and AD-816                             | Dated E3 competitor facts with attributable sources; unknown fields remain E0. |
| Project measurements   | AD-806 through AD-813, plus AD-825 and AD-826 | E2 observations with their scenario and raw evidence.                          |
| Comparison publication | AD-817 and AD-818                             | E4 conclusions only where the required inputs are compatible and complete.     |

Until the applicable gate completes, a public-facing comparison row may show
the dimension and its evidence state, but it must not draw a conclusion. A
dimension with only E0 or E1 evidence is not comparable.

## Review checklist

Before accepting a populated comparison entry, confirm all of the following:

- The entry contains exactly one dimension and identifies its subject.
- Its evidence level matches the attached material rather than the desired
  narrative.
- The source locator, revision or version, verifier, and verification date are
  present.
- The scope states what was included and excluded.
- A measurement includes a reproducible procedure and raw artifact.
- A competitor fact is dated and attributable to the named subject.
- A conclusion cites compatible inputs and states its limitations.
- Missing, incompatible, stale, or unverified inputs are marked as such; no
  conclusion has been inferred from them.
