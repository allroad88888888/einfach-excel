# Handsontable scale and architecture evidence

This is a staging ledger for dated E3 facts about Handsontable. It is not a
comparison, measurement report, capacity claim, or product conclusion. Every
record is limited to what its primary source states; a field without a record
is `unknown` in this leaf, not a conclusion about Handsontable.

## Reading and expiry discipline

- **Subject:** Handsontable, as named by its official documentation repository.
- **Verifier:** AD-816 evidence maintainer.
- **Verification date:** 2026-08-13.
- **Maintenance owner:** AD-816 evidence maintainer.
- **Review state:** current on the verification date; next review due
  2026-11-11. It becomes stale on 2026-11-12 if not successfully reviewed.
- **Recheck triggers:** a cited file, its URL, or the applicable Handsontable
  release changes; the source becomes inaccessible; or the record's scope is
  questioned.
- **Review log:** 2026-08-13 — AD-816 evidence maintainer — source verified;
  current; next review due 2026-11-11.

This follows [the comparison-evidence maintenance procedure](COMPARISON_EVIDENCE_MAINTENANCE.md).
Before a record is used in a public comparison, the maintenance owner must add
the exact public-statement reference and follow that procedure's stale and
withdrawal path. These staging records currently support no public statement.

## E3 records

### E3-HANDSONTABLE-001 — row display projection

- **Subject and dimension:** Handsontable grid; display projection boundary.
- **Fact:** Handsontable's row-virtualization guide describes rendering the
  visible part of the grid in the DOM, with an optional row or column offset
  outside the viewport. It identifies `viewportRowRenderingOffset` as the
  setting that determines rows displayed outside the visible viewport.
- **Evidence level:** E3 — verified competitor fact.
- **Primary source:** [Handsontable's Row virtualization source](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/docs/content/guides/rows/row-virtualization/row-virtualization.md).
- **Source version or date:** documentation commit
  `95657194616688831eb689a531e4d6c7580ab7be`, dated 2026-08-13.
- **Verification date and verifier:** 2026-08-13; AD-816 evidence maintainer.
- **Applicable scope:** the documented Handsontable grid row-virtualization
  feature and its `viewportRowRenderingOffset` configuration.
- **Limitations:** this is a documentation-backed rendering-mechanism fact. It
  records no workload, observed resource use, exact rendered-row count, or
  outcome for a particular configuration.
- **Public-statement reference and lifecycle:** none; current; owner AD-816
  evidence maintainer; review log 2026-08-13, source verified; next review due
  2026-11-11.

## Explicit unknowns

The following AD-814 dimensions have no primary-source record in this leaf.
They remain E0 / `unknown` here and must not be filled by architectural
analogy or treated as a statement that Handsontable lacks a mechanism.

| Dimension                    | Evidence state | Missing primary fact for this leaf                        |
| ---------------------------- | -------------- | --------------------------------------------------------- |
| Stored-record representation | E0 / unknown   | Documented stored-record indexing or blank-cell handling. |
| Range dependency selection   | E0 / unknown   | Selection criterion and fallback boundary.                |
| Range command boundary       | E0 / unknown   | Range-command representation or refusal rule.             |
| Evaluation trigger           | E0 / unknown   | Documented trigger or deferral condition.                 |
| Cross-sheet evaluation path  | E0 / unknown   | Documented cross-sheet evaluation routing boundary.       |
| Layer ownership              | E0 / unknown   | Documented boundary between relevant layers.              |

The E3 record above does not create an E4 comparison conclusion. It is not
interchangeable with this repository's E1 mechanisms or any E2 measurement.
