# Auto fill

The maintained React path is FillHandle drag/double-click → `dragFillHandleAtom` →
`fillSelectionAtom` → `range.fill` → `fill-io` → Rust Worker/WASM `apply_auto_fill`.
React submits geometry and bounded options. Rust reads the actual source cells, infers each
matrix lane, preflights all destinations, copies effective formats, and creates one history entry.
Ctrl/Meta copy bypasses named-list candidates. Cancellation has no writes or history.
The pure `detectFillSeries` API remains available for older integrations; the maintained drag
path does not use browser-calculated source values or generated output cells.

## Session catalog and host API

`fillSeriesLocaleAtom` is the readonly **host-only** configuration. The public
`setFillSeriesLocaleAtom` is its sole writer and returns `true` on success, `false` on invalid
input. Invalid writes preserve the entire previous host configuration and saved directory.
Host read-modify-write therefore cannot copy user entries back into the host source.
The default locale is `en`; UI language does not select the list locale.
Supported canonical locale families are en/zh/tr/az, optionally with script and region.

Saved user entries have one writable backing directory (`saved-list-state.ts`).
The Series panel's `lists` is a readonly compatible projection. Only Save/Delete changes the
catalog; draft changes, Cancel, Escape and explicit Apply do not save it. Closing and changing
sheets preserve it. Workbook replacement resets user entries while preserving host configuration.
Stores are isolated. Neither native workbook persistence nor XLSX stores this session catalog.

`effectiveFillSeriesLocaleAtom` merges the two sources as a readonly view for integrations.
The native candidate projection is also derived, never a writable mirror. Built-in English and
Chinese weekday/month lists win first, then host candidates in stable name order, then user
insertion order, then generic text-number inference. Users override host entries with the same
locale-folded display name; deletion reveals the original host entry. Names within each source
must remain unique. Names beginning with `builtin-` or `locale-` are reserved protocol names.
Wire `host:`/`user:` namespaces preserve display names and do not bypass native validation.

Save, explicit custom-list Apply and automatic fill share the canonical locale fold, including
Turkic I/combining-dot and Greek Final Sigma. A locale update that would create duplicate saved
values or duplicate names within a source is atomically rejected. Cross-source name collisions
remain legal user overrides. Values match whole strings, not prefixes or display-rendered numbers.
Generated text uses the saved spelling; existing source spelling is unchanged.

## Bounds and native ownership

Host configuration permits 32 custom lists and two optional weekday/month lists. The user
catalog permits 32 lists independently of built-ins: at most **66 external candidates**.
Each list has 2–512 nonempty, locale-folded unique values and at most 16,384 UTF-16 code units
of values. The panel's existing 16,384-unit text-input limit also includes line separators.
Host/user display names are at most 64 UTF-16 units, wire names at most 80.
All bounds use UTF-16 units in JS and Rust, including supplementary characters.

Aggregate wire metadata (values + names + locale) is capped at 1,100,000 UTF-16 units.
Every legal maximum directory fits: 66 × (16,384 + 69 + 11) = 1,086,624, where 69 includes
`host:`/`user:` and 11 is the maximum supported canonical locale length. Even the wider native
80-unit protocol-name allowance remains below the total cap. Invalid metadata rejects the request;
there is no truncation and built-ins do not consume the 32-user quota.

Rust validates and builds immutable normalized lookup maps once per request. Its Arc-backed
prepared catalog is shared across matrix lanes. A lane folds only its source labels (at most once
for en/zh and once for tr/az), tests membership and all modular source steps, and continues to later
candidates when one order is inconsistent. Repeated identical source items use copy fallback.
Up/Left use the same modular cycle; number/formula lanes retain their existing behavior.
The selected witness is shared and actual source membership is rechecked during application.
No global catalog cache or second workbook state is created.

Geometric explicit Step/Stop and Calendar explicit Weekday/Year retain their existing native
planning and rejection rules. Stop reports only the actual written prefix. The global fill cap
is 1,048,576 cells. Protection, validation, spill and merged-cell gates remain native and atomic.

Relevant proofs: `fill_saved_lists.rs`, `fill_saved_list_catalog.rs`, `saved-list-locale.test.ts`,
`saved-list-command.test.ts`, and the real-browser `fill-custom-list-drag*.spec.ts` files.
