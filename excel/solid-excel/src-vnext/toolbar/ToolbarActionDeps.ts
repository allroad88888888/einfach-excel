import type { Accessor } from 'solid-js'
import type {
  ProjectionSnapshot,
  SpreadsheetBackend,
  SpreadsheetCellFormat,
  SelectionSnapshot,
  ToolbarCommandAvailability,
} from '@einfach/spreadsheet-ui-core'
import type { useSpreadsheetUiStore } from '../provider'

/** Stable host dependencies shared by toolbar command controllers. */
export interface ToolbarActionDeps {
  activeCellFormat: () => SpreadsheetCellFormat
  availability: Accessor<ToolbarCommandAvailability>
  backend: SpreadsheetBackend
  closeSurface: () => void
  getMutationSheetId: () => string | null | undefined
  projectionSnapshot: Accessor<ProjectionSnapshot>
  selectionSnapshot: Accessor<SelectionSnapshot>
  store: ReturnType<typeof useSpreadsheetUiStore>
}
