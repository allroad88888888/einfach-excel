import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { labels, messages } from './messages'
import { PatternFillTools } from './PatternFillTools'
import { PatternFillDialog } from './PatternFillDialog'

/** Optional appearance editors; the shared border dialog owns its single command lifecycle. */
export const cellAppearancePlugin: SpreadsheetPlugin = {
  id: 'cell-appearance',
  ribbonItems: [{ id: 'pattern-fill', after: 'format.fill-color-palette', Item: PatternFillTools }],
  panels: [PatternFillDialog],
  borderPresets: [
    { preset: 'diagonal-down', label: labels.diagonalDown },
    { preset: 'diagonal-up', label: labels.diagonalUp },
    { preset: 'diagonal', label: labels.diagonalBoth },
    { preset: 'diagonal-none', label: labels.diagonalNone },
  ],
  messages,
}
