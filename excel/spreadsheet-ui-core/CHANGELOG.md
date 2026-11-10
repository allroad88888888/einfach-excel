# @einfach-excel/spreadsheet-ui-core

## 0.3.0

### Minor Changes

- 88501e1: Add `createWorkbookApi(store)` for explicit worksheet/range operations, navigation, editing,
  native history, before-change cancellation, and interaction subscriptions. Preserve native
  commit outcomes, worksheet identities, navigation, and unrelated geometry during API updates.

  Add stable ribbon item visibility controls, configurable row/column header dimensions,
  and clipped Canvas cell painting hooks to the React spreadsheet.

  Add host highlights, pixel visibility queries, formula dialog controls, and nested draw/calculation
  suspension. Add native rich text runs with history and content movement, a segment editor,
  DOM/Canvas rendering, and native-file/XLSX round trips.

  Keep plain cell text on the direct rendering path and reserve a bounded six-screen
  vertical projection buffer so coalesced wheel input does not outrun painted cells.

- c316273: Remove unused Solid-era modules and exports from `@einfach-excel/spreadsheet-ui-core`.

  **Removed (breaking)**

  - `print/*`: `DEFAULT_PRINT_CONFIG`, `HeaderFooterFields`, `ManualPageBreak`, `OpenPageSetupInput`, `PageSetupDraftPatch`, `PageSetupPhase`, `PageSetupSaveOutcome`, `PageSetupSession`, `PrintConfig`, `PrintConfigSource`, `PrintOrientation`, `PrintScale`, `ReadPrintConfigRequest`, `ReadPrintConfigResult`, `RetryPageSetupRefreshInput`, `RunPageSetupSaveInput`, `SetPrintConfigRequest`, `SetPrintConfigResult`, `cancelPageSetupAtom`, `clearPrintConfigAtom`, `hydratePrintConfigAtom`, `openPageSetupAtom`, `pageSetupCanCancelAtom`, `pageSetupCanEditAtom`, `pageSetupCanRetryRefreshAtom`, `pageSetupDialogOpenAtom`, `pageSetupSessionAtom`, `printConfigStateAtom`, `printPreviewOpenAtom`, `retryPageSetupRefreshAtom`, `runPageSetupSaveAtom`, `setPrintConfigAtom`, `shiftManualPageBreaks`, `snapshotPrintConfig`, `togglePrintPreviewAtom`, `updatePageSetupDraftAtom`.
  - `presence/*` & presence contracts: `LocalPresencePayload`, `MAX_PARTICIPANTS`, `Participant`, `PresenceState`, `PresenceUpdate`, `PublishLocalPresenceRequest`, `RemoteCursor`, `RemoteEditEvent`, `SubscribePresenceUnsubscribe`, `applyPresenceUpdateAtom`, `applyRemoteEditEventAtom`, `clearPresenceAtom`, `lastRemoteEditEventAtom`, `presenceStateAtom`, `remoteCursorsAtom`.
  - `menu/*`: `MenuAllTarget`, `MenuCellTarget`, `MenuCloseIntent`, `MenuCloseReason`, `MenuColumnTarget`, `MenuCommandIntent`, `MenuCommandKind`, `MenuHighlightIntent`, `MenuIntent`, `MenuInteractionSource`, `MenuOpenInput`, `MenuOpenIntent`, `MenuPosition`, `MenuRangeTarget`, `MenuRowTarget`, `MenuSheetTabTarget`, `MenuState`, `MenuStatus`, `MenuSurface`, `MenuTarget`, `MenuTargetKind`, `RunViewportHiddenContextMenuCommandInput`, `ViewportHiddenContextMenuCommandAvailability`, `ViewportHiddenContextMenuCommandKind`, `applyMenuIntent`, `clearMenuIntentAtom`, `closeMenuAtom`, `createMenuCloseIntent`, `createMenuCommandIntent`, `createMenuHighlightIntent`, `createMenuOpenIntent`, `dispatchMenuCommandAtom`, `dispatchMenuIntentAtom`, `isViewportHiddenContextMenuCommand`, `menuCommandIntentAtom`, `menuHighlightAtom`, `menuIntentAtom`, `menuOpenAtom`, `menuPositionAtom`, `menuStateAtom`, `menuTargetAtom`, `openMenuAtom`, `runViewportHiddenContextMenuCommandAtom`, `updateMenuHighlightAtom`, `viewportHiddenContextMenuCommandAvailabilityAtom`.
  - `menu-bar/*`: `HelpOverlayKind`, `MENU_BAR_ITEMS`, `MenuBarEntry`, `MenuItemDescriptor`, `MenuItemDispatch`, `MenuItemSeparator`, `TopMenuDescriptor`, `TopMenuId`, `TopMenuOpenState`, `closeHelpOverlayAtom`, `closeTopMenuAtom`, `findMenuByAccessKey`, `findTopMenu`, `helpOverlayAtom`, `isMenuItemDescriptor`, `openHelpOverlayAtom`, `openTopMenuAtom`, `topMenuHighlightAtom`, `topMenuOpenAtom`.
  - `format-cells/*`: `CURRENCY_FORMAT_OPTIONS`, `CurrencyFormatOption`, `DATE_TIME_FORMAT_OPTIONS`, `FORMAT_CELLS_SAVE_LEDGER_MAX`, `FormatCellsBackendCapabilities`, `FormatCellsBackendCapabilitySource`, `FormatCellsDialogId`, `FormatCellsDraft`, `FormatCellsDraftExtras`, `FormatCellsEditorClosedState`, `FormatCellsEditorOpenState`, `FormatCellsEditorState`, `FormatCellsGradient`, `FormatCellsLocalAcknowledgement`, `FormatCellsNumberCategory`, `FormatCellsReadVisibleProjectionPort`, `FormatCellsRefreshProjectionPort`, `FormatCellsResolveSourceRangesPort`, `FormatCellsSaveAttempt`, `FormatCellsSaveAttemptStatus`, `FormatCellsSavePhase`, `FormatCellsSaveRequest`, `FormatCellsSaveResult`, `FormatCellsSetFormatRangePort`, `FormatCellsTabId`, `NUMBER_FORMAT_OPTIONS`, `NumberFormatDialogClosedState`, `NumberFormatDialogKind`, `NumberFormatDialogOpenState`, `NumberFormatDialogState`, `OpenFormatCellsInput`, `OpenNumberFormatDialogInput`, `PatchNumberFormatDialogInput`, `PatternFormatOption`, `RunFormatCellsSaveInput`, `captureFormatCellsBackendCapabilitiesAtom`, `closeFormatCellsAtom`, `closeNumberFormatDialogAtom`, `createFormatCellsSaveController`, `detectFormatCellsNumberCategory`, `formatCellsActiveTabAtom`, `formatCellsCanSubmitAtom`, `formatCellsDialogOpenAtom`, `formatCellsDraftAtom`, `formatCellsEditorAtom`, `formatCellsNumberCategoryAtom`, `formatCellsPreviewText`, `formatCellsPreviewTextAtom`, `formatCellsSaveBlockedAtom`, `formatCellsSaveLedgerAtom`, `formatCellsSavePayloadAtom`, `numberFormatDialogAtom`, `numberFormatDialogSaveBlockedAtom`, `numberFormatDialogSaveLedgerAtom`, `numberFormatDialogSavePayloadAtom`, `numberFormatForCategory`, `openFormatCellsAtom`, `openNumberFormatDialogAtom`, `patchFormatCellsDraftAtom`, `patchNumberFormatDialogAtom`, `runFormatCellsSaveAtom`, `runNumberFormatDialogSaveAtom`, `saveFormatCellsAtom`, `saveNumberFormatDialogAtom`, `setFormatCellsActiveTabAtom`.
  - `formula-bar/*`: `FormulaBarDiagnostic`, `FormulaBarDiagnosticLevel`, `FormulaBarState`, `FormulaBarStatus`, `FormulaBarSyncInput`, `FormulaBarSyncSource`, `createFormulaBarState`, `focusFormulaBarAtom`, `focusFormulaBarState`, `formulaBarDraftAtom`, `formulaBarFocusedAtom`, `formulaBarStateAtom`, `setFormulaBarDiagnosticAtom`, `setFormulaBarDiagnosticState`, `setFormulaBarErrorAtom`, `setFormulaBarErrorState`, `syncFormulaBarAtom`, `syncFormulaBarState`, `updateFormulaBarDraftState`.
  - `rich-types/*` & rich-value contracts: `DisplayCellRichValue`, `HyperlinkValue`, `RichBooleanValue`, `RichErrorValue`, `RichNumberValue`, `RichTextRun`, `RichTextRunFormat`, `RichTextValue`, `SetCellRichValueRequest`, `cloneRichValue`, `getDisplayCellText`, `getRichValueText`, `isHyperlinkValue`, `isRichTextValue`, and `DisplayCell.richValue`.
  - `viewport/*`: `FrozenWindows`, `countVisibleIndices`, `getFrozenWindows`, `getVisibleWindowWithHidden`.
  - Legacy capability re-exports: `FindRangeRequest`, `FindRangeResult`, `ReplaceMatchesRequest`, `ReplaceMatchesResult`, `SearchRangeRequest`, `SearchRangeResult`.

### Patch Changes

- Updated dependencies [88501e1]
  - @einfach-excel/excel-wasm@0.3.0

## 0.2.0

### Minor Changes

- 9622ccd: 删除 UI Core 中没有消费者的缩放和视图模式状态。

  **移除（breaking）**

  - `@einfach-excel/spreadsheet-ui-core`：`zoomLevelAtom`、`setZoomLevelAtom`、`resetZoomLevelAtom`、
    `snapZoomToPreset`、`ZOOM_LEVEL_PRESETS/MIN/MAX/DEFAULT`、`viewModeAtom`、`setViewModeAtom`、
    `StatusBarViewMode`。网格与打印从不读它们 —— 点击只会改一个没人看的数字。菜单栏的
    `view.zoomIn/zoomOut/zoomReset` 三条命令（其 dispatch 分支本来就是空实现）一并删除。

- dcc7ebc: 提供浏览器 React 18 ESM 工作簿包，包含隔离样式、实例语言、模块 Worker 与预编译 WASM。
  同一 Einfach Store 上公开 typed 原始值读取、原子批量写入、真实成功修改通知和宿主交互控制。
  React 的 UI Core peer 最低为提供这些接口的 0.2.0；旧 0.1.0 不包含本轮契约。

### Patch Changes

- Updated dependencies [dcc7ebc]
  - @einfach-excel/excel-wasm@0.2.0
