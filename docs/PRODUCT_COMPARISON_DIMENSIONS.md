# Product comparison dimensions

This document defines the non-scale field vocabulary for a public product
comparison. It is a schema, not a comparison result. It contains no fact,
measurement, ranking, release assertion, installation assertion, or support
promise about this project or any comparison subject.

## Boundary

The fields here cover product characteristics that are not scale dimensions.
Scale and architecture dimensions belong to the
[scale comparison dimensions](SCALE_COMPARISON_DIMENSIONS.md) schema. Evidence
review, expiry, withdrawal, and republication belong to the
[comparison evidence maintenance](COMPARISON_EVIDENCE_MAINTENANCE.md)
procedure.

This schema does not collect sources, decide which products to compare, or
draw a conclusion. A field without adequate evidence is recorded as
`unknown`; it must not be represented as a favorable, unfavorable, neutral,
available, unavailable, compatible, incompatible, or implied value.

## Required record fields

Every populated cell must identify one subject and one dimension. The record
for that cell must include the following fields.

| Field             | Required content                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Subject           | The named product, package, service, edition, or repository being described.                  |
| Dimension         | One dimension from the vocabulary below.                                                      |
| Stated value      | The exact bounded fact, observation, or explicit `unknown` state.                             |
| Source locator    | A primary URL or immutable artifact locator for a non-unknown value.                          |
| Source version    | The applicable version, revision, edition, date, or explicit absence of one.                  |
| Verification date | The calendar date on which the source or artifact was checked.                                |
| Verifier          | The named person or accountable role that checked the source.                                 |
| Scope             | The package, edition, interface, runtime, artifact, or other boundary that limits the value.  |
| Limitation        | Missing inputs, ambiguity, exclusions, or a condition that prevents a broader interpretation. |

An `unknown` value still names its subject, dimension, verifier, verification
date, scope, and reason evidence is missing or insufficient. It does not need
an invented source locator or version.

## Non-scale dimensions

| Dimension                  | A record may state                                                                                                                | Scope required for interpretation                                                                                                                                          | It must not infer                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| License                    | The license identifier, license text locator, applicable edition, or `unknown`.                                                   | The version, edition, component, and any separately licensed artifact.                                                                                                     | Commercial terms, redistribution rights, or license compatibility beyond the cited terms.                                  |
| Delivery form              | The declared artifact form, distribution channel, source checkout form, hosted form, or `unknown`.                                | The exact artifact, version or revision, channel, and access condition stated by the source.                                                                               | That an artifact can currently be installed, accessed, purchased, self-hosted, or used in a particular environment.        |
| Data or backend decoupling | The documented boundary between a UI layer and a data, storage, calculation, transport, or backend interface, or `unknown`.       | The named layers, interface, direction of dependency, configuration, and excluded layers.                                                                                  | Interchangeability, migration cost, portability, remote operation, or absence of coupling outside the documented boundary. |
| Computation location       | The documented process, runtime, device, worker, service, or boundary where a named calculation is stated to occur, or `unknown`. | The calculation path, runtime configuration, request boundary, and whether the source is descriptive or observed.                                                          | Latency, privacy, cost, availability, network behavior, or execution for paths not covered by the evidence.                |
| Package-size basis         | The measurement basis required for a package-size value, or `unknown`.                                                            | Artifact name, exact version or revision, included files, unpacked or compressed form, compressor and settings when applicable, measurement command or artifact, and date. | A size value, download cost, runtime memory use, bundle impact, or comparison result without that complete basis.          |
| Framework integration      | The documented binding, adapter, package, interface, or integration boundary for one named framework, or `unknown`.               | The framework name and version range if stated, integration package or interface, edition, runtime, and source date.                                                       | Framework support, compatibility, parity, maintenance level, or suitability beyond the cited boundary.                     |

The vocabulary is intentionally not a feature checklist. If a proposed field
mixes two dimensions, split it into separate records. If it is a scale or
architecture claim, use the scale schema instead of adding it here.

## Verification rules

1. A non-unknown value requires a dated, attributable source or artifact that
   supports the exact stated value within the recorded scope.
2. A source description records only what that source describes. It does not
   establish observed behavior, package availability, performance, or a
   comparison conclusion.
3. Package-size values require a reproducible measurement basis. Entries with
   different artifact or compression bases remain separate rather than being
   compared.
4. A documented framework interface does not establish a support commitment.
   Record the interface boundary only unless separate evidence supports a more
   limited statement.
5. A documented decoupling or computation boundary does not establish a
   product advantage. Keep the record descriptive and retain its limitations.
6. Missing, stale, conflicting, inaccessible, or non-primary evidence leaves
   the value `unknown` until a verifier records sufficient evidence.

Evidence levels, comparability requirements, and the rules for a public
conclusion are defined by the
[scale comparison dimensions](SCALE_COMPARISON_DIMENSIONS.md) schema. Once a
record supports a public statement, its continuing review is governed by the
[comparison evidence maintenance](COMPARISON_EVIDENCE_MAINTENANCE.md)
procedure.
