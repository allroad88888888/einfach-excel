# Univer product evidence

This is a staging ledger for dated E3 facts about Univer's non-scale product
dimensions. It is not a product comparison, performance report, installation
claim, compatibility claim, or marketing conclusion. Each record states only
what its primary source documents within the recorded scope; missing evidence
is `unknown` rather than inferred.

## Reading and expiry discipline

- **Subject:** Univer, as named by its official repository or documentation.
- **Verifier:** AD-405 evidence maintainer.
- **Verification date:** 2026-08-13.
- **Maintenance owner:** AD-405 evidence maintainer.
- **Review state:** current on the verification date; next review due
  2026-11-11. A record not successfully reviewed becomes stale on 2026-11-12.
- **Recheck triggers:** a cited file, revision, URL, or applicable product
  condition changes; a source becomes inaccessible; or a later public
  statement changes scope or is questioned.

This follows [the comparison-evidence maintenance procedure](COMPARISON_EVIDENCE_MAINTENANCE.md).
These staging records currently support no public statement. Before one is
used in a public comparison, the maintenance owner must add the exact
public-statement reference and apply that procedure's review, stale, and
withdrawal path.

## E3 records

### E3-UNIVER-PRODUCT-001 — repository license text

- **Subject and dimension:** Univer repository; license.
- **Fact:** the repository root `LICENSE` identifies its text as “Apache
  License, Version 2.0, January 2004.”
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Univer repository `LICENSE`](https://github.com/dream-num/univer/blob/ee85ccbef9693e81e99b0534f07c287c56ce9fce/LICENSE).
- **Source version or date:** repository commit
  `ee85ccbef9693e81e99b0534f07c287c56ce9fce`, authored 2024-01-23
  (UTC-06:00).
- **Verification date and verifier:** 2026-08-13; AD-405 evidence maintainer.
- **Applicable scope:** the root license file in the cited Univer repository
  revision.
- **Limitations:** this does not establish commercial terms, redistribution
  rights, license compatibility, separately licensed components, or the terms
  of any package or edition not covered by that file.
- **Public-statement reference and lifecycle:** none; current; owner AD-405
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-PRODUCT-002 — documented UMD delivery form

- **Subject and dimension:** Univer documentation; delivery form.
- **Fact:** the CDN guide documents UMD global builds for use through HTML
  `<script>` tags and names jsDelivr and unpkg as CDN providers. Its preset-mode
  example references `@univerjs/presets` and `@univerjs/preset-sheets-core`
  UMD paths.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Univer's CDN guide](https://github.com/dream-num/documentation/blob/c61eab834d1a22621ee89711be65f92252e6e51b/content/guides/sheets/getting-started/installation/cdn.mdx).
- **Source version or date:** documentation commit
  `c61eab834d1a22621ee89711be65f92252e6e51b`, authored 2026-03-16
  (UTC+08:00).
- **Verification date and verifier:** 2026-08-13; AD-405 evidence maintainer.
- **Applicable scope:** the guide's documented global-build form and its named
  preset-mode example paths.
- **Limitations:** the guide does not pin a Univer package version for those
  paths or establish present access, installation, purchase, self-hosting, or
  use in any particular environment.
- **Public-statement reference and lifecycle:** none; current; owner AD-405
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-PRODUCT-003 — Web Worker data boundary

- **Subject and dimension:** Univer Web Worker configuration; data or backend
  decoupling.
- **Fact:** the Web Worker architecture guide describes the worker codebase as
  a separate Univer instance. It states that `@univerjs/rpc` provides
  communication and synchronization of data and mutations between that worker
  instance and the main-thread instance.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Univer's Web Worker architecture guide](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx).
- **Source version or date:** documentation commit
  `4910c62a96b2ccfd2086309b3d167cfd8f454b0b`, authored 2025-07-18
  (UTC+08:00).
- **Verification date and verifier:** 2026-08-13; AD-405 evidence maintainer.
- **Applicable scope:** the guide's main-thread and Web Worker two-instance
  configuration using the named RPC plugin.
- **Limitations:** this does not establish a storage or server-backend
  boundary, interchangeability, migration cost, remote operation, or an
  absence of coupling outside the documented configuration.
- **Public-statement reference and lifecycle:** none; current; owner AD-405
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-PRODUCT-004 — Web Worker formula computation location

- **Subject and dimension:** Univer Web Worker configuration; computation
  location.
- **Fact:** in the documented configuration, the main-thread formula plugin is
  set with `notExecuteFormula: true`; the guide states that formula
  computations occur in the Web Worker thread.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Univer's Web Worker architecture guide](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx).
- **Source version or date:** documentation commit
  `4910c62a96b2ccfd2086309b3d167cfd8f454b0b`, authored 2025-07-18
  (UTC+08:00).
- **Verification date and verifier:** 2026-08-13; AD-405 evidence maintainer.
- **Applicable scope:** formula calculation in the guide's specified
  main-thread/Web Worker setup.
- **Limitations:** this does not describe the default configuration, other
  calculation paths, latency, cost, privacy, availability, or performance.
- **Public-statement reference and lifecycle:** none; current; owner AD-405
  evidence maintainer; next review due 2026-11-11.

### E3-UNIVER-PRODUCT-005 — React lifecycle integration boundary

- **Subject and dimension:** Univer Sheets core preset documentation;
  framework integration.
- **Fact:** the React 18 and 19 guide initializes Univer inside React's
  `useEffect`, passes a React ref's current value as the preset container, and
  calls `univerAPI.dispose()` from the effect cleanup function.
- **Evidence level:** E3 — verified product fact.
- **Primary source:** [Univer's React integration guide](https://github.com/dream-num/documentation/blob/00789a9db73c03685f68dc85f83df6023c3ca326/content/guides/sheets/getting-started/integrations/react.mdx).
- **Source version or date:** documentation commit
  `00789a9db73c03685f68dc85f83df6023c3ca326`, authored 2025-08-15
  (UTC+08:00).
- **Verification date and verifier:** 2026-08-13; AD-405 evidence maintainer.
- **Applicable scope:** the guide's React 18 and 19 example using
  `@univerjs/preset-sheets-core` and `@univerjs/presets`.
- **Limitations:** this documents one example boundary only; it does not
  establish framework support, compatibility, parity, maintenance level, or
  suitability for any React version or another framework.
- **Public-statement reference and lifecycle:** none; current; owner AD-405
  evidence maintainer; next review due 2026-11-11.

## Explicit unknowns

| Subject         | Dimension          | Stated value   | Verification date and verifier         | Scope and missing evidence                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------ | -------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Univer packages | Package-size basis | E0 / `unknown` | 2026-08-13; AD-405 evidence maintainer | No primary artifact record supplies an exact package version or revision, included files, compressed or unpacked form, compression settings, measurement command or artifact, and measurement date. The AD-405 maintenance owner must recheck this unknown by 2026-11-11; it supports no public statement. |

The E3 records and E0 unknown above do not create a product comparison or a
conclusion about another product.
