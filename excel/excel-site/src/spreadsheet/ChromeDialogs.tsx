/**
 * Every dialog/overlay surface `@einfach/solid-excel/vnext` ships, mounted
 * unconditionally. None
 * of these components take required props; each one reads its own
 * open/closed state from the spreadsheet store, so mounting is a no-op
 * until something (menu, toolbar, keyboard shortcut, context menu) opens it.
 *
 * Deliberately excluded here: `SpreadsheetContextMenu`, `SpreadsheetFormatPainter`,
 * and `SpreadsheetFormulaAutocomplete` are chrome pieces gated by
 * `ChromeConfig`, not dialogs — they are mounted by `SpreadsheetChrome`
 * itself.
 */
import {
  SpreadsheetCommentThread,
  SpreadsheetConditionalFormatDialog,
  SpreadsheetDataValidationDialog,
  SpreadsheetFilterDropdown,
  SpreadsheetFindReplaceDialog,
  SpreadsheetFormatCellsDialog,
  SpreadsheetGoToDialog,
  SpreadsheetNameManagerDialog,
  SpreadsheetPasteSpecialDialog,
  SpreadsheetPresenceOverlay,
  SpreadsheetPrintPreviewOverlay,
  SpreadsheetProtectionUnlockDialog,
  SpreadsheetRemoveDuplicatesDialog,
  SpreadsheetTextToColumnsDialog,
} from '@einfach/solid-excel/vnext'

export default function ChromeDialogs() {
  return (
    <>
      <SpreadsheetFormatCellsDialog />
      <SpreadsheetFindReplaceDialog />
      <SpreadsheetGoToDialog />
      <SpreadsheetFilterDropdown />
      <SpreadsheetConditionalFormatDialog />
      <SpreadsheetDataValidationDialog />
      <SpreadsheetNameManagerDialog />
      <SpreadsheetPasteSpecialDialog />
      <SpreadsheetTextToColumnsDialog />
      <SpreadsheetRemoveDuplicatesDialog />
      <SpreadsheetCommentThread />
      <SpreadsheetPrintPreviewOverlay />
      <SpreadsheetProtectionUnlockDialog />
      <SpreadsheetPresenceOverlay />
    </>
  )
}
