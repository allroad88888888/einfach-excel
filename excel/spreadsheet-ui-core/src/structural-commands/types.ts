import type {
  FilterVisibleRowDeleteOutcome,
  SpreadsheetOperationSource,
  StructureOperationCommandOutcome,
  StructureOperationControllerPort,
} from '../operations'
import type { OutlineCommandOutcome } from '../outline'
import type {
  ViewportHiddenCommandOutcome,
  ViewportHiddenPersistencePort,
} from '../viewport/hidden'

/** A structure action whose target is the current primary selection. */
export type StructuralCommand =
  | 'insert-rows-above'
  | 'insert-rows-below'
  | 'delete-rows'
  | 'insert-columns-left'
  | 'insert-columns-right'
  | 'delete-columns'
  | 'hide-rows'
  | 'unhide-rows'
  | 'hide-columns'
  | 'unhide-columns'
  | 'group-rows'
  | 'ungroup-rows'
  | 'group-columns'
  | 'ungroup-columns'

/** Ports already owned by the spreadsheet host; this module retains none of them. */
export type StructuralCommandSource = StructureOperationControllerPort &
  ViewportHiddenPersistencePort

export type StructuralCommandOutcome =
  | StructureOperationCommandOutcome
  | FilterVisibleRowDeleteOutcome
  | ViewportHiddenCommandOutcome
  | OutlineCommandOutcome

export interface RunStructuralCommandInput {
  readonly command: StructuralCommand
  readonly source?: StructuralCommandSource
  /** Required by transport-backed insert/delete commands to reveal the new projection. */
  readonly refreshProjection?: (sheetId: string) => Promise<void>
  readonly timeoutMs?: number
  readonly operationSource?: SpreadsheetOperationSource
}
