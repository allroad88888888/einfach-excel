import type {
  FormatCellsNumberCategory,
  FormatCellsTabId,
  SpreadsheetAlignment,
  SpreadsheetBorderStyle,
  SpreadsheetVerticalAlignment,
} from '@einfach/spreadsheet-ui-core'

export interface FormatCellsTabDescriptor {
  readonly id: FormatCellsTabId
  readonly labelKey: string
}

export const FORMAT_CELLS_TABS: readonly FormatCellsTabDescriptor[] = [
  { id: 'number', labelKey: 'formatCells.tab.number' },
  { id: 'alignment', labelKey: 'formatCells.tab.alignment' },
  { id: 'font', labelKey: 'formatCells.tab.font' },
  { id: 'border', labelKey: 'formatCells.tab.border' },
  { id: 'fill', labelKey: 'formatCells.tab.fill' },
]

export const NUMBER_CATEGORIES: readonly FormatCellsNumberCategory[] = [
  'general',
  'number',
  'currency',
  'accounting',
  'date',
  'time',
  'percentage',
  'fraction',
  'scientific',
  'text',
  'special',
  'custom',
]

export const SUPPORTED_CATEGORIES: ReadonlySet<FormatCellsNumberCategory> = new Set([
  'general',
  'number',
  'currency',
  'date',
  'percentage',
  'custom',
])

export const BORDER_STYLES: readonly SpreadsheetBorderStyle[] = [
  'thin',
  'medium',
  'thick',
  'dashed',
  'dotted',
  'double',
]

export const FONT_FAMILIES: readonly string[] = [
  'system-ui, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Georgia, "Times New Roman", serif',
  '"Courier New", monospace',
]

export const HORIZONTAL_ALIGNS: readonly SpreadsheetAlignment[] = [
  'left',
  'center',
  'right',
  'fill',
  'justify',
  'distributed',
]

export const VERTICAL_ALIGNS: readonly SpreadsheetVerticalAlignment[] = ['top', 'center', 'bottom']
