// 一句话：定义 Vanilla 编辑 POC 各独立部件之间的公共契约。

import type { Store } from '@einfach/core'
import type {
  CellCoord,
  CellRange,
  DisplayCell,
  EditingCommitOutcome,
  EditingSessionState,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

export interface VanillaEditingPocOptions {
  readonly backend: SpreadsheetBackend
  readonly initialCell?: CellCoord
  readonly sheetId: string
  readonly window?: CellRange
}

export interface VanillaEditingProjectionSession {
  readonly load: () => Promise<void>
  readonly readCell: (cell: CellCoord) => DisplayCell | null
  readonly refresh: (sheetId: string) => Promise<void>
}

export interface VanillaEditingSession {
  readonly commit: () => Promise<EditingCommitOutcome>
  readonly start: (cell: CellCoord, draft: string) => EditingSessionState
  readonly state: () => EditingSessionState
  readonly writeDraft: (draft: string) => void
}

export interface VanillaEditingPoc {
  readonly commit: () => Promise<EditingCommitOutcome>
  readonly destroy: () => void
  readonly start: () => EditingSessionState
  readonly state: () => EditingSessionState
  readonly store: Store
  readonly writeDraft: (draft: string) => void
}
