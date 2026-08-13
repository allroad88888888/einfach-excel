# Scale technical whitepaper

This paper is the AD-819 reading path for scale-related technical evidence in
this repository. It joins current implementation mechanisms with the dated
external records already collected for the scale schema. It is an evidence
index for AD-600, not a product statement or a comparison conclusion.

## Evidence status

The evidence vocabulary is defined in
[Scale comparison dimensions](SCALE_COMPARISON_DIMENSIONS.md). This paper
keeps its categories separate:

| Evidence | Present material                                        | What it establishes                              |
| -------- | ------------------------------------------------------- | ------------------------------------------------ |
| E1       | Current-project source facts and boundary contracts     | A mechanism or ownership rule in this repository |
| E2       | No compatible observations in the evidence matrix       | Nothing available for a cross-subject result     |
| E3       | Dated source records for Univer Sheets and Handsontable | A bounded statement from the named source        |
| E4       | None                                                    | No conclusion is available                       |

An E1 mechanism is not an E2 observation. An E3 record is not evidence that
another subject has the same behavior as this repository. E0 / `unknown`
fields remain unknown; they do not describe a missing product capability.

## Current-project mechanisms (E1)

The [scale facts](SCALE_FACTS.md) page is the citation index for the live
source. The [scale architecture](SCALE_ARCHITECTURE.md) page gives the
corresponding ownership model. Together, they describe four distinct layers.

| Layer                 | Current source mechanism                                                                                 | Boundary document                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Sparse storage        | Stored cell and formula records are indexed separately from geometric blanks.                            | [Sparse storage model](SPARSE_STORAGE_MODEL.md)                 |
| Range dependencies    | A formula range selects member, row-band, column, or sheet invalidation roots from normalized geometry.  | [Range dependency tiers](RANGE_DEPENDENCY_TIERS.md)             |
| Display projection    | A validated request/result rectangle carries display data without becoming workbook state.               | [Projection boundary contract](PROJECTION_BOUNDARY_CONTRACT.md) |
| Range-native commands | An oversized selection retains its rectangle for a supported backend operation or is explicitly refused. | [Boundedness contracts](BOUNDEDNESS_CONTRACTS.md)               |

These layers have separate ownership. Sparse storage chooses which records are
present; dependency selection chooses observation roots; projection owns a
display result for a requested rectangle; and command selection preserves a
rectangle when address expansion is outside that command's limit. The
architecture page defines these as code facts and contracts, rather than an
observation about any workload.

Two related source-backed boundaries complete the reading path:

- [On-demand evaluation](ON_DEMAND_EVALUATION.md) records when documented
  reads request evaluation or retain deferred work.
- [Cross-sheet evaluation](CROSS_SHEET_EVALUATION.md) records the routing
  boundary for evaluation across sheets.

The E1 record says only what the cited source and contract say at their stated
scope. It does not establish a size limit, an elapsed-time result, resource
use, a backend-transfer property, or behavior in an uncited host integration.

## Dated external records (E3)

The [scale comparison evidence matrix](SCALE_COMPARISON_EVIDENCE_MATRIX.md)
contains the accepted dated records. It currently records:

- Univer Sheets documentation for workbook and worksheet data representation;
- Univer rendering documentation for viewport and render-unit boundaries; and
- Handsontable documentation for row virtualization and its viewport offset.

Each matrix row preserves its source revision, verification date, scope,
exclusions, review date, and recheck trigger. The record is deliberately
descriptive: it does not convert a cited external mechanism into an equivalence
claim about this project.

## Missing evidence and conclusion gate

The matrix has no compatible E2 protocol, dataset shape, environment, or
configuration. Its external rows therefore have comparability state `not
applicable`. It also lists E0 / `unknown` dimensions whose primary-source input
has not been recorded. Neither state can be filled by inference.

There is no E4 conclusion in this paper. AD-818 is the sole route for a
qualified comparison conclusion after the requirements in the AD-814 schema
are complete and compatible. Until then, AD-600 can cite this paper only as a
route to the bounded E1 and E3 records above.

## Statement boundary

This paper makes no ranking, recommendation, performance statement, capacity
statement, transport statement, or cross-subject conclusion. A reader needing
an exact claim must follow the linked source or contract, retain its scope and
exclusions, and preserve the evidence level when reusing it.
