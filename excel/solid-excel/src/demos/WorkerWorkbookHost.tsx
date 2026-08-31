import { Show } from 'solid-js'
import { acceptFormulaSuggestion } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetCommentThread } from '../comments'
import { SpreadsheetConditionalFormatDialog } from '../conditional-formatting'
import { SpreadsheetContextMenu } from '../context-menu'
import { SpreadsheetDataValidationDialog } from '../data-validation'
import { SpreadsheetDiagnosticsReadout, SpreadsheetSpillBlockedHint } from '../diagnostics'
import { SpreadsheetFilterDropdown } from '../filter-sort'
import { SpreadsheetFindReplaceDialog } from '../find-replace'
import { SpreadsheetFormatPainter } from '../format-painter'
import { SpreadsheetFormulaAutocomplete } from '../formula-autocomplete'
import { SpreadsheetFormulaBar } from '../formula-bar'
import { SpreadsheetGoToDialog } from '../go-to'
import { SpreadsheetGrid } from '../grid'
import { SpreadsheetHistoryTimeline } from '../history'
import { SpreadsheetMenuBar } from '../menu-bar'
import { SpreadsheetNameManagerDialog } from '../named-ranges'
import { SpreadsheetPasteSpecialDialog } from '../paste-special'
import { SpreadsheetPresenceOverlay } from '../presence'
import { SpreadsheetPrintPreviewOverlay } from '../print'
import { SpreadsheetProtectionUnlockDialog } from '../protection'
import { SpreadsheetRemoveDuplicatesDialog } from '../remove-duplicates'
import { SpreadsheetSheetTabs } from '../sheet-tabs'
import { SpreadsheetStatusBar } from '../status-bar'
import { SpreadsheetTextToColumnsDialog } from '../text-to-columns'
import { SpreadsheetToolbar } from '../toolbar'
import { useSpreadsheetUiStore } from '../provider'
import { workerDemoSheets, workerDemoViewport } from './worker-workbook-config'

export function WorkerWorkbookHost(props: { activeSheetId: () => string }) {
  const store = useSpreadsheetUiStore()

  return (
    <>
      <SpreadsheetMenuBar data-testid="vnext-worker-menu-bar" />
      <SpreadsheetToolbar data-testid="vnext-worker-toolbar" />
      <SpreadsheetFormulaBar data-testid="vnext-worker-formula-bar" />
      <Show keyed when={props.activeSheetId()}>
        {(sheetId) => (
          <SpreadsheetGrid
            sheetId={sheetId}
            viewport={workerDemoViewport}
            data-testid="vnext-worker-grid"
          />
        )}
      </Show>
      <SpreadsheetSheetTabs sheets={workerDemoSheets} data-testid="vnext-worker-sheet-tabs" />
      <SpreadsheetSpillBlockedHint />
      <SpreadsheetStatusBar data-testid="vnext-worker-status-bar" />
      <SpreadsheetDiagnosticsReadout data-testid="vnext-worker-diagnostics-readout" />
      <SpreadsheetContextMenu data-testid="vnext-worker-context-menu" />
      <SpreadsheetFormatPainter data-testid="vnext-worker-format-painter" />
      <SpreadsheetFindReplaceDialog data-testid="vnext-worker-find-replace" />
      <SpreadsheetGoToDialog data-testid="vnext-worker-go-to" />
      <SpreadsheetTextToColumnsDialog data-testid="vnext-worker-text-to-columns" />
      <SpreadsheetRemoveDuplicatesDialog data-testid="vnext-worker-remove-duplicates" />
      <SpreadsheetFilterDropdown data-testid="vnext-worker-filter-dropdown" />
      <SpreadsheetConditionalFormatDialog data-testid="vnext-worker-conditional-format" />
      <SpreadsheetDataValidationDialog data-testid="vnext-worker-data-validation" />
      <SpreadsheetNameManagerDialog data-testid="vnext-worker-name-manager" />
      <SpreadsheetPasteSpecialDialog data-testid="vnext-worker-paste-special" />
      <SpreadsheetCommentThread data-testid="vnext-worker-comment-thread" />
      <SpreadsheetPrintPreviewOverlay data-testid="vnext-worker-print-preview" />
      <SpreadsheetProtectionUnlockDialog data-testid="vnext-worker-protection-unlock" />
      <SpreadsheetHistoryTimeline data-testid="vnext-worker-history-timeline" />
      <SpreadsheetPresenceOverlay data-testid="vnext-worker-presence" />
      <SpreadsheetFormulaAutocomplete
        data-testid="vnext-worker-formula-autocomplete"
        onAccept={(suggestion) => {
          const { caret } = acceptFormulaSuggestion(store, suggestion)
          queueMicrotask(() => {
            const el = document.activeElement
            if (
              el instanceof HTMLInputElement &&
              (el.classList.contains('cell-input') ||
                el.classList.contains('spreadsheet-formula-bar-input'))
            ) {
              el.focus()
              el.setSelectionRange(caret, caret)
            }
          })
        }}
      />
    </>
  )
}
