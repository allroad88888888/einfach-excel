# Handsontable product evidence

This is a staging ledger for dated E3 facts about Handsontable's non-scale
product dimensions. It is not a product comparison, performance report,
installation claim, support commitment, or recommendation. Each record states
only what its primary source documents within the recorded scope; missing
evidence is `unknown` rather than inferred.

## Reading and expiry discipline

- **Subject:** Handsontable, as named by its official documentation repository.
- **Verifier:** AD-406 evidence maintainer.
- **Verification date:** 2026-08-13.
- **Maintenance owner:** AD-406 evidence maintainer.
- **Review state:** current on the verification date; next review due
  2026-11-11. A record not successfully reviewed becomes stale on 2026-11-12.
- **Recheck triggers:** a cited file, revision, URL, or applicable product
  condition changes; a source becomes inaccessible; or a later public
  statement changes scope or is questioned.
- **Review log:** 2026-08-13 — AD-406 evidence maintainer — sources verified;
  current; next review due 2026-11-11.

This follows [the comparison-evidence maintenance procedure](COMPARISON_EVIDENCE_MAINTENANCE.md).
The records below support only the exact public table locations recorded in
each lifecycle entry. They remain subject to that procedure's review, stale,
and withdrawal path.

## E3 records

### E3-HANDSONTABLE-PRODUCT-001 — repository license text

- **Subject and dimension:** Handsontable repository; license.
- **Fact:** the repository root `LICENSE.txt` describes the software as
  dual-licensed and identifies a referenced non-commercial license document
  for strictly personal or evaluation use and an applicable license agreement
  for commercial use.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Handsontable repository `LICENSE.txt`](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/LICENSE.txt).
- **Source version or date:** repository commit
  `95657194616688831eb689a531e4d6c7580ab7be`, authored 2026-08-13 (UTC).
- **Verification date and verifier:** 2026-08-13; AD-406 evidence maintainer.
- **Applicable scope:** the root license text in the cited Handsontable
  repository revision.
- **Limitations:** this only records the cited text. It does not determine
  commercial terms, redistribution rights, license compatibility, separately
  licensed artifacts, or terms for any package or edition not covered by it.
- **Public-statement reference and lifecycle:** `README.md`, “Dated product
  facts”; `README.zh-CN.md`, “已核实的产品事实”; site English
  `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current;
  owner AD-406 evidence maintainer; review log 2026-08-13, sources verified;
  next review due 2026-11-11.

### E3-HANDSONTABLE-PRODUCT-002 — React wrapper delivery metadata

- **Subject and dimension:** `@handsontable/react-wrapper`; delivery form.
- **Fact:** its package manifest declares CommonJS and ES-module entry paths,
  a type declaration path, and `unpkg` and `jsdelivr` distribution paths.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Handsontable React wrapper manifest](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json).
- **Source version or date:** package version `18.0.0` in repository commit
  `95657194616688831eb689a531e4d6c7580ab7be`, authored 2026-08-13 (UTC).
- **Verification date and verifier:** 2026-08-13; AD-406 evidence maintainer.
- **Applicable scope:** the named wrapper manifest at its declared version and
  its listed entry-path metadata.
- **Limitations:** manifest fields do not establish current availability,
  installation, access, purchase, self-hosting, or behavior in an environment.
- **Public-statement reference and lifecycle:** `README.md`, “Dated product
  facts”; `README.zh-CN.md`, “已核实的产品事实”; site English
  `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current;
  owner AD-406 evidence maintainer; review log 2026-08-13, sources verified;
  next review due 2026-11-11.

### E3-HANDSONTABLE-PRODUCT-003 — React wrapper interface boundary

- **Subject and dimension:** `@handsontable/react-wrapper`; framework
  integration.
- **Fact:** the package manifest names the package `@handsontable/react-wrapper`,
  maps its root export to type, ESM-import, and CommonJS-require entries,
  declares `handsontable` `^18.0.0` as a peer dependency, and lists React
  `^18.2.0` in its development dependencies.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Handsontable React wrapper manifest](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json).
- **Source version or date:** package version `18.0.0` in repository commit
  `95657194616688831eb689a531e4d6c7580ab7be`, authored 2026-08-13 (UTC).
- **Verification date and verifier:** 2026-08-13; AD-406 evidence maintainer.
- **Applicable scope:** the named wrapper's root-export, peer-dependency, and
  development-dependency declarations in the cited manifest revision.
- **Limitations:** this records a declared package interface only. It does not
  establish framework support, compatibility, parity, maintenance level, or
  suitability for a React version or another framework.
- **Public-statement reference and lifecycle:** `README.md`, “Dated product
  facts”; `README.zh-CN.md`, “已核实的产品事实”; site English
  `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current;
  owner AD-406 evidence maintainer; review log 2026-08-13, sources verified;
  next review due 2026-11-11.

## Explicit unknowns

| Subject                    | Dimension                  | Stated value   | Verification date and verifier         | Scope and missing evidence                                                                                                                      | Public-statement reference and lifecycle                                                                                                                                                         |
| -------------------------- | -------------------------- | -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Handsontable documentation | Data or backend decoupling | E0 / `unknown` | 2026-08-13; AD-406 evidence maintainer | No primary record reviewed for this leaf identifies a data, storage, transport, or backend boundary.                                            | `README.md`, “Dated product facts”; `README.zh-CN.md`, “已核实的产品事实”; site English `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current; owner AD-406; due 2026-11-11. |
| Handsontable documentation | Computation location       | E0 / `unknown` | 2026-08-13; AD-406 evidence maintainer | No primary record reviewed for this leaf identifies a calculation path, runtime, device, worker, or service boundary.                           | `README.md`, “Dated product facts”; `README.zh-CN.md`, “已核实的产品事实”; site English `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current; owner AD-406; due 2026-11-11. |
| Handsontable packages      | Package-size basis         | E0 / `unknown` | 2026-08-13; AD-406 evidence maintainer | No primary artifact record reviewed for this leaf supplies a complete version, included-file, compression, measurement-command, and date basis. | `README.md`, “Dated product facts”; `README.zh-CN.md`, “已核实的产品事实”; site English `/#dated-product-facts`; site Chinese `/zh/#dated-product-facts`; current; owner AD-406; due 2026-11-11. |

The E3 records and E0 unknowns above support only descriptive public facts.
They do not create a performance conclusion, recommendation, compatibility
claim, or product ranking.
