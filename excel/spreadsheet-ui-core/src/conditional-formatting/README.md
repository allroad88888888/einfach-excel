# conditional-formatting

Conditional format rule editor state and backend port declarations.

## State Decision Template

- Source atoms (private): rules cache, editor session, request sequence, launch token, and bounded operation ledger.
- Derived/public atoms:
  - `conditionalFormatRulesCacheAtom`: frozen bounded rule list for the active sheet (max 200).
  - `conditionalFormatEditorAtom`: frozen editor/session snapshot.
  - `conditionalFormatOperationAttemptLedgerAtom`: frozen local transport evidence.
  - `conditionalFormatMutationBlockedAtom`: whether any outcome remains unknown.
- Commands:
  - `setConditionalFormatRulesAtom` — replace cache wholesale, truncates to cap.
  - `openConditionalFormatEditorAtom` — open panel with existing entry or blank draft.
  - `closeConditionalFormatEditorAtom` — discard draft, close panel.
  - `setConditionalFormatEditorKindAtom` — change the selected rule kind while idle.
  - `runConditionalFormatMutationAtom` — reserve, dispatch, acknowledge, and reconcile a guarded mutation.
- Scale bound: rule list bounded to `CONDITIONAL_FORMAT_RULES_MAX = 200`; draft is a single descriptor.
- Backend reads: `DisplayCell.conditionalFormat` overlay delivered per cell in existing projection responses; no new projection kind.
- Per-cell/per-row atom risk: none — overlay is consumed directly from `DisplayCell[]`.
- Tests: `test/conditional-formatting.test.ts`.
