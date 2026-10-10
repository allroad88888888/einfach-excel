# text-to-columns

## Maintained React path

The legacy wizard below is not the maintained React implementation. The React batch routes
`textColumns.preview` / `textColumns.apply` through the existing Rust workbook Worker commands.
Rust owns source values, tokenization, full-range validation, overwrite checks and native history;
the Worker only maps sheet identity, supplies canvas bounds and guards the preview revision.
The React view uses `textColumnsPanelAtom` / `runTextColumnsPanelAtom` in `native-panel.ts`.
Draft changes invalidate the bounded preview and overwrite confirmation; the user explicitly
refreshes preview before applying. The command guards selection identity, destination protection
and workbook revision, then publishes the one native mutation projection. See the
[current feature progress](../../../react-excel/FEATURE_PROGRESS.md).

Unspecified fields preserve text (including leading zeros and leading `=`) and destination format.
Source-indexed `columnTypes` can select General, Text, six numeric date orders, or Skip. Rust owns
conversion and compacted output geometry; explicit types change only number format, and empty fields
clear values. Invalid dates remain literal text, and no field executes as a formula. Two-digit date
years use a fixed 2029 cutoff. Skipping every source field is rejected without mutation.
Changing split rules clears field types; changing a type invalidates preview and overwrite consent.
The source field selector can address fields beyond the twelve-column preview limit. The native
`sourceColumnCount` describes the full source shape, not the compacted or sampled result.
Preview sampling is bounded but validation and application use the complete selected source.

`numberOptions` applies only to General fields. Rust accepts an explicit dot/comma decimal
separator, an optional thousands separator (dot, comma, space, nonbreaking space, narrow
nonbreaking space or apostrophe), and opt-in trailing minus. Thousands groups after the first
must contain exactly three digits; decimal and thousands separators must differ. Invalid or
non-finite numbers retain their original text instead of falling back to another decimal rule.
Text, explicit Date and unspecified fields are unchanged. Number options preserve field type
choices but invalidate preview and overwrite consent; reopening the panel resets the options.
The React disclosure only shows these controls; it does not parse workbook values.

## Legacy wizard

Owns the 3-step Text to Columns wizard. Splits a single-column selection
into multiple columns by delimiter or fixed-width slice positions, then
emits a single `importCellChunks` plan so undo collapses into one entry.

## State Decision Template

### Source atoms

Implementation-private backing atoms in `state.ts` own the dialog state:
source rows, anchor, sheet id, open state, wizard state, session/request
identities, lifecycle/error, capability, entrypoint ids/state, and active
entrypoint/finish tickets. The public read atoms (`textToColumnsSourceAtom`,
`textToColumnsAnchorAtom`, `textToColumnsSheetIdAtom`,
`textToColumnsOpenAtom`, `textToColumnsWizardAtom`, and their lifecycle
peers) are read-only projections over those sources. Keeping the writable
atoms private prevents UI code from bypassing lifecycle and ticket rules.

### Derived atoms

- `textToColumnsPreviewAtom` — first `TEXT_TO_COLUMNS_PREVIEW_CAP` (100)
  source rows tokenized under the current wizard config. Bounded cache
    cap: **100 rows × 500 total cells** (`TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP`).
    A row that exceeds the remaining budget gets a trailing
    `TEXT_TO_COLUMNS_PREVIEW_TRUNCATION_MARK` (`'…'`); the marker
    counts against the cap so a truncated row emits at most
    `TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP` cells (marker included). Rows
    past the budget emit an empty `tokens` list (so row anchoring is
    preserved).
- `textToColumnsColumnCountAtom`, `textToColumnsHasSourceAtom`,
  `textToColumnsNextBlockAtom`, and the `textToColumnsCan*Atom` family
  calculate UI affordances from source state. `textToColumnsEntrypointProjectionAtom`
  calculates the capability-aware host projection without taking ownership
  of it.

### Command atoms

- `openTextToColumnsAtom({ sheetId, anchor, rows })`
- `closeTextToColumnsAtom`
- `captureTextToColumnsCapabilityAtom` and `dispatchTextToColumnsWizardAtom`
  establish a valid session before state changes.
- `confirmTextToColumnsAtom` returns a `TextToColumnsCommitPlan` (or `null`
  if not on step-3 / no source); `runTextToColumnsEntrypointAtom` captures
  entrypoint state; `runTextToColumnsFinishAtom` is the sole mutation
  command. The host adapter forwards its plan through `backend.importCellChunks`.

## Wizard state machine

- **Step 1** picks `mode: 'delimited' | 'fixed'`.
- **Step 2 (delimited)** picks delimiter set, `otherChar`,
  `treatConsecutiveAsOne`, `textQualifier`.
- **Step 2 (fixed)** picks `breakpoints: readonly number[]` (character
  offsets from the start of the source string).
- **Step 3** picks per-output-column
  `format: 'general' | 'text' | 'date' | 'skip'`.

Skip-marked columns drop entirely from the import plan. `text` columns
pass `preserveAsText: true` on the import chunk so the backend inserts
the value as a literal string (no numeric inference, no formula parsing).

## Date format limitation

`format: 'date'` is currently routed identically to `'general'` — UI
core stays locale-free, so date parsing is deferred to the backend's
existing input pipeline. The Step 3 select disables the Date option and
surfaces a tooltip ("Date format is not yet supported — values would be
imported as General") so users see the limitation up front. A future
host-supplied `parseDate(input)` port can layer locale-aware parsing on
top without changing this module's atoms.

## Capability gating

The Data menu entry sets `isAvailable: 'capability'` /
`capabilityKey: 'textToColumns'`. The host resolves the key to
`backend.importCellChunks != null`; when the backend omits the port the
menu entry is hidden entirely (matching the Paste Special pattern).

## Backend port

Reuses `importCellChunks`; the source column is overwritten as part of
the same transaction so undo restores the original full text in one
step. No new backend method.

## Mutation gateway gate

`runTextToColumnsFinishAtom` resolves the commit target through
`resolveContentMutationAtom` (`kind: 'import-cell-chunks'`) before
allocating a request id. A protection block fails closed: lifecycle goes
`blocked`, the gateway's structured diagnostic (`MUTATION_BLOCKED_LOCKED`)
is recorded, its message becomes `textToColumnsErrorAtom`, and zero
transport is launched. The commit plan's rows are source rows already —
filtering hides rows instead of compacting them (#27) — so the single
`importCellChunks` request can always express the target.

## Scale

- Preview cap holds at 100 rows even when the source range is 100k tall.
- Full split is deferred to commit; nothing per-cell or per-row is cached
  in atoms.

## Tests

`test/text-to-columns.test.ts`:
- Step-1 default `'delimited'` survives advance.
- `comma + space` with `treatConsecutiveAsOne` collapses runs.
- Text qualifier `"` strips outer quotes and unescapes doubled quotes.
- Fixed-width breakpoints past row length emit empty strings.
- `format: 'skip'` drops a column from the emit plan.
- `format: 'text'` sets `preserveAsText: true` on the emitted chunk.
- Commit returns `null` when wizard is not on step-3.
- Preview cap holds at 100 rows on a 100k source.
