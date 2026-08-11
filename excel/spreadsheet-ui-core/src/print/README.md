# print

Owns print configuration state per sheet: print area, manual page breaks, scale, orientation, header/footer.

## State Decision Template

- Source atoms:
  - `printConfigStateAtom`: map of sheetId → PrintConfig; bounded by sheet count.
  - `printPreviewOpenAtom`: boolean for preview overlay visibility.
  - `pageSetupSessionAtom`: one Page Setup session with its draft, phase, and request identities.
- Derived atoms:
  - `pageSetupDialogOpenAtom`, edit/cancel/retry capability atoms derive from the session.
- Commands:
  - `setPrintConfigAtom` — cache a confirmed config for a sheet.
  - `clearPrintConfigAtom` — remove config for a sheet.
  - `togglePrintPreviewAtom` — flip preview open state.
  - `openPageSetupAtom`, `updatePageSetupDraftAtom`, `cancelPageSetupAtom` — own the edit session.
  - `runPageSetupSaveAtom` — writes only with both backend ports, requiring an exact write ACK and exact read-back before it updates the cache.
  - `retryPageSetupRefreshAtom` — reconciles an unknown or failed save by read only; it never repeats the write.
- Scale bound: one record per sheet; sheet count is bounded.
- Backend reads: `readPrintConfig` / `setPrintConfig` are optional host ports. Page Setup enters a cancellable blocked state before dispatch when both are unavailable.
- Per-cell/per-row/per-col atom risk: none; config is per-sheet.
- Pure helpers: `shiftManualPageBreaks` for row/col structural edits.
- Tests: `test/print-page-area.test.ts`, `test/print-page-setup.test.ts`.
