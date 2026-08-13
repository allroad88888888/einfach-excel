# Univer scale and architecture evidence

This is a staging ledger for dated E3 facts about Univer. It is not a
comparison, measurement report, capacity claim, or product conclusion. Every
record is limited to what its primary source states; absence of a record is
recorded as `unknown`, not inferred from another source.

## Reading and expiry discipline

- **Subject:** Univer, as named by its official documentation repository.
- **Verifier:** AD-815 evidence maintainer.
- **Verification date:** 2026-08-13.
- **Maintenance owner:** AD-815 evidence maintainer.
- **Review state:** current on the verification date; next review due
  2026-11-11. It becomes stale on 2026-11-12 if not successfully reviewed.
- **Recheck triggers:** a cited file, its URL, or the applicable Univer release
  changes; the source becomes inaccessible; or any later public statement
  changes scope or is questioned.

This follows [the comparison-evidence maintenance procedure](COMPARISON_EVIDENCE_MAINTENANCE.md).
Before a record is used in a public comparison, the maintenance owner must add
the exact public-statement reference and follow that procedure's stale and
withdrawal path. These staging records currently support no public statement.

## E3 records

### E3-UNIVER-001 — workbook snapshot shape

- **Subject and dimension:** Univer Sheets; stored-record representation.
- **Fact:** `IWorkbookData` declares `sheetOrder` as an ordered array of sheet
  IDs and `sheets` as a sheet-ID-keyed record of partial worksheet data. It
  also declares `resources` for plugin data.
- **Evidence level:** E3 — verified competitor fact.
- **Primary source:** [Univer's Workbook Data Structure source](https://github.com/dream-num/univer-documentation/blob/6623f50c8762510e31effcc8e02810c28b3983e8/content/guides/sheets/model/workbook-data.mdx).
- **Source version or date:** documentation commit
  `6623f50c8762510e31effcc8e02810c28b3983e8`, dated 2025-08-06.
- **Verification date and verifier:** 2026-08-13; AD-815 evidence maintainer.
- **Applicable scope:** the documented `IWorkbookData` snapshot format for
  Univer Sheets.
- **Limitations:** this does not describe runtime storage, blank-cell
  materialization, memory use, load behavior, or any capacity.
- **Public-statement reference and lifecycle:** none; current; owner AD-815
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-002 — worksheet cell and style references

- **Subject and dimension:** Univer Sheets; stored-record representation.
- **Fact:** the documented `IWorksheetData.cellData` structure is keyed first
  by row and then by column. A cell's `s` field may hold a style identifier;
  the documentation says repeated style objects are stored in
  `IWorkbookData.styles` and can be referenced by that identifier.
- **Evidence level:** E3 — verified competitor fact.
- **Primary source:** [Univer's Cell Data Structure source](https://github.com/dream-num/univer-documentation/blob/fbd03c99491df3843bdc604486c8e1b0a9677436/content/guides/sheets/model/cell-data.mdx).
- **Source version or date:** documentation commit
  `fbd03c99491df3843bdc604486c8e1b0a9677436`, dated 2025-12-15.
- **Verification date and verifier:** 2026-08-13; AD-815 evidence maintainer.
- **Applicable scope:** the documented Univer Sheets worksheet snapshot and
  style-data representation.
- **Limitations:** the source does not quantify record counts, retained object
  size, actual deduplication outcomes, or behavior under a particular sheet.
- **Public-statement reference and lifecycle:** none; current; owner AD-815
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-003 — renderer projection mechanism

- **Subject and dimension:** Univer Sheets renderer; display projection
  boundary.
- **Fact:** Univer's rendering architecture describes a `Viewport` as selecting
  which part of a scene is rendered. Its sheet-scrolling description states
  that the rendering engine draws incremental views while scrolling.
- **Evidence level:** E3 — verified competitor fact.
- **Primary source:** [Univer's Rendering Engine Architecture source](https://github.com/dream-num/univer-documentation/blob/2f4f9cdc60a2d30372500c37e9109af685afe21d/content/guides/recipes/architecture/rendering.mdx).
- **Source version or date:** documentation commit
  `2f4f9cdc60a2d30372500c37e9109af685afe21d`, dated 2025-09-06.
- **Verification date and verifier:** 2026-08-13; AD-815 evidence maintainer.
- **Applicable scope:** the documented render-engine behavior for the Sheet
  scene and scrolling path.
- **Limitations:** it does not establish request ownership, backend transfer,
  cache size, rendered-cell count, or any observed cost for a workload.
- **Public-statement reference and lifecycle:** none; current; owner AD-815
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-004 — render-unit ownership

- **Subject and dimension:** Univer renderer; layer ownership.
- **Fact:** the rendering architecture assigns each `RenderUnit` an engine, a
  scene, a unit model, and an injector for rendering and interaction modules;
  the source describes each render unit as handling its rendering and
  interaction logic independently.
- **Evidence level:** E3 — verified competitor fact.
- **Primary source:** [Univer's Rendering Engine Architecture source](https://github.com/dream-num/univer-documentation/blob/2f4f9cdc60a2d30372500c37e9109af685afe21d/content/guides/recipes/architecture/rendering.mdx).
- **Source version or date:** documentation commit
  `2f4f9cdc60a2d30372500c37e9109af685afe21d`, dated 2025-09-06.
- **Verification date and verifier:** 2026-08-13; AD-815 evidence maintainer.
- **Applicable scope:** the documented rendering architecture, specifically its
  `RenderUnit` and `IRenderModule` arrangement.
- **Limitations:** it establishes no cross-unit isolation property, resource
  bound, concurrency behavior, or equivalence with this repository's layers.
- **Public-statement reference and lifecycle:** none; current; owner AD-815
  evidence maintainer; next review due 2026-11-11.

## Explicit unknowns

The following AD-814 dimensions have no primary source recorded by this leaf.
They remain E0 and must not be filled by architectural analogy.

| Dimension                   | Evidence state | Missing primary fact                                    |
| --------------------------- | -------------- | ------------------------------------------------------- |
| Range dependency selection  | E0 / unknown   | Selection criterion and fallback boundary.              |
| Range command boundary      | E0 / unknown   | Oversized-range command representation or refusal rule. |
| Evaluation trigger          | E0 / unknown   | Documented trigger or deferral condition.               |
| Cross-sheet evaluation path | E0 / unknown   | Documented evaluation routing boundary.                 |

The E3 records above do not create an E4 comparison conclusion. They are not
interchangeable with this repository's E1 mechanisms or any E2 measurement.
