# Scale observation index

This index points to the accepted, dated E2 scale observations already recorded
in this repository. It restates only the observation facts at the cited
revision and environment; it does not add a run, benchmark, or conclusion.

## How to read these records

Each record has its own fixture, revision, browser environment, and settled
condition. Values from different records must not be combined into a capacity,
performance, service-level, transport, or competitive claim. Follow the linked
report and raw record when an exact command, environment field, or boundary is
needed.

## Indexed observations

| Issue  | Revision-scoped observation                                                                                                                                                                                                                                                                          | Authoritative record                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AD-807 | A 10,000,000-nonempty-cell TSV reached the browser import path, then the normalized-cell guard rejected cell 200,001. The run therefore has no successful ten-million import, first-screen, post-success memory, DOM, subscription, or capacity result.                                              | [Report](AD807_TEN_MILLION_LOAD_OBSERVATION.md) · [raw record](observations/ad807/ten-million-load-2026-08-13.json)                       |
| AD-810 | In the recorded revision, browser, and Wasm import path, an exact 200,000 normalized-cell input completed and a 200,001-cell input was rejected on the 201st default chunk. This is a revision-specific session-boundary observation, not a performance, capacity, or SLO result.                    | [Report](AD810_IMPORT_SESSION_BOUNDARY_OBSERVATION.md) · [raw record](observations/ad810/import-session-boundary-2026-08-13.json)         |
| AD-826 | For the `N=96` fixture, one 12-by-4 first-screen read returned 48 populated cells, including 24 shallow direct-reference formulas. In the recorded runs, the formula-evaluation counter changed from 0 to 24 after that read.                                                                        | [Report](AD826_FIRST_SCREEN_EVALUATION_OBSERVATION.md) · [raw record](observations/ad826/first-screen-formula-evaluation-2026-08-13.json) |
| AD-827 | For the same `N=96` fixture, the recorded `canonical-json-utf8-v1` message representation was 4,291 bytes for the 48-cell bounded read and 8,539 bytes for the explicit 96-cell fixture read. These are normalized JSON payload values in one Worker-message window, not network or transport bytes. | [Report](AD827_BOUNDED_VS_FULL_RANGE_READ_OBSERVATION.md) · [raw record](observations/ad827/bounded-vs-full-range-read-2026-08-13.json)   |
| AD-808 | A 6,000,000-cell AD-806 fill on the live DemoMillion surface completed viewport travel, a far-corner jump, and a full-grid selection with DOM/subscription counts staying viewport-sized. The requested ten-million tier was not reached: the direct fill trapped at exactly 7,340,000 accepted cells in three attempts, and live-page seeding at 7,000,000 crashed the renderer twice.                    | [Report](AD808_SCALE_INTERACTION_OBSERVATION.md) · [raw record](observations/ad808/scale-interaction-2026-08-17.json)                     |
| AD-809 | A 7,000,000-cell workbook with a 7,000-deep chain and a whole-column `SUM(A:A)` imported with zero evaluations; a 12×4 window read evaluated 13 formulas; cumulative evaluations after all probes were 20,861 (≈0.30% of populated cells). Deep-chain counter deltas use engine-specific accounting.                                                                                                     | [Report](AD809_SCALE_RECALC_OBSERVATION.md) · [raw record](observations/ad809/scale-recalc-2026-08-17.json)                               |

## Interpretation boundary

AD-807 records a rejection boundary, not a ten-million-cell success. AD-810
does not make the import guard a general capacity limit. AD-826 does not state
how cells outside its first-screen range evaluate. AD-827 excludes
structured-clone size, network transfer, full-workbook loading, latency,
throughput, memory, capacity, and general implementation behavior. AD-808 and
AD-809 record six- and seven-million-cell tiers plus deterministic seeding
boundaries; neither is a ten-million success, a capacity limit statement, or a
benchmark, and their wall-clock values are single-run samples.

Accordingly, this index supports no performance, capacity, SLO, transport, or
competitive conclusion. The records are observations of their stated
revision/environment scopes only.
