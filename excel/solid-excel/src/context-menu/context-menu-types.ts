import type { MenuCommandKind } from '@einfach/spreadsheet-ui-core'

/** Commands that can be rendered by the spreadsheet context-menu manifest. */
export type ContextMenuCommandKind = MenuCommandKind | 'clipboard.pasteSpecial'

/** Public presentation options for the spreadsheet context-menu surface. */
export interface SpreadsheetContextMenuProps {
  class?: string
  'data-testid'?: string
}
