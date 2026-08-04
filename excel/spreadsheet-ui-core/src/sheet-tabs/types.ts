import type {
  ProjectionRevision,
  SheetListResult,
  SpreadsheetBackend,
  SpreadsheetSheetMetadata,
} from '../backend'
import type { WorkspaceActiveSheetAuthorityWitness } from '../workspace'

export type SheetTabInteractionSource = 'pointer' | 'keyboard' | 'context-menu' | 'programmatic'

export type SheetTabIntent =
  | { type: 'sheet-tab.context-menu.open'; sheetId: string; x: number; y: number; source: SheetTabInteractionSource }
  | { type: 'sheet-tab.context-menu.close'; reason: 'dismissed' | 'sheet-changed' | 'committed' | 'cancelled' }
  | { type: 'sheet-tab.rename.begin'; sheetId: string; draftName: string; source: SheetTabInteractionSource }
  | { type: 'sheet-tab.rename.change'; sheetId: string; draftName: string }
  | { type: 'sheet-tab.rename.commit'; sheetId: string; name: string; source: SheetTabInteractionSource }
  | { type: 'sheet-tab.rename.cancel'; sheetId: string; reason: 'escape' | 'blur' | 'sheet-changed' }
  | { type: 'sheet-tab.reorder.begin'; sheetId: string; source: SheetTabInteractionSource }
  | { type: 'sheet-tab.reorder.update'; sheetId: string; beforeSheetId: string | null; afterSheetId: string | null; targetIndex: number | null }
  | { type: 'sheet-tab.reorder.commit'; sheetId: string; beforeSheetId: string | null; afterSheetId: string | null; targetIndex: number | null }
  | { type: 'sheet-tab.reorder.cancel'; sheetId: string; reason: 'escape' | 'blur' | 'sheet-changed' }

export type SheetTabsPhase = 'unloaded' | 'loading' | 'ready'
export type SheetTabMutationKind = 'add' | 'rename' | 'delete' | 'reorder'
export type SheetTabMutationPhase = 'pending' | 'acknowledged' | 'refreshing'
export type SheetTabMutationOutcome = 'acknowledged' | 'rejected' | 'protocol-error' | 'projection-error'

export interface SheetTabsCapabilities { list: boolean; add: boolean; rename: boolean; delete: boolean; reorder: boolean }
export interface SheetTabDeleteConfirmationState { sheetId: string; sheetName: string }
export interface SheetTabMutationState { kind: SheetTabMutationKind; phase: SheetTabMutationPhase; requestId: number; sessionId: number; sheetId: string | null; activeSheetIdAtDispatch: string | null }
export interface SheetTabMutationResultState { kind: SheetTabMutationKind; outcome: SheetTabMutationOutcome; requestId: number; sessionId: number; sheetId: string | null }
export interface SheetTabContextMenuState { sheetId: string; x: number; y: number; source: SheetTabInteractionSource }
export interface SheetTabRenameState { sheetId: string; draftName: string; source: SheetTabInteractionSource }
export interface SheetTabReorderState { sheetId: string; beforeSheetId: string | null; afterSheetId: string | null; targetIndex: number | null; source: SheetTabInteractionSource }

export interface SheetTabsState {
  phase: SheetTabsPhase
  sessionId: number
  loadRequestId: number | null
  capabilities: SheetTabsCapabilities
  mutation: SheetTabMutationState | null
  lastMutation: SheetTabMutationResultState | null
  error: string | null
  contextMenu: SheetTabContextMenuState | null
  rename: SheetTabRenameState | null
  reorder: SheetTabReorderState | null
  deleteConfirmation: SheetTabDeleteConfirmationState | null
  lastIntent: SheetTabIntent | null
}

export interface ActivateSheetTabInput { sheetId: string }
export interface SheetTabsSheetState { sheets: SpreadsheetSheetMetadata[]; revision?: ProjectionRevision }
export interface SetSheetTabsSheetsInput { sheets: readonly SpreadsheetSheetMetadata[]; revision?: ProjectionRevision }
export interface OpenSheetTabContextMenuInput { sheetId: string; x: number; y: number; source?: SheetTabInteractionSource }
export interface BeginSheetTabRenameInput { sheetId: string; draftName: string; source?: SheetTabInteractionSource }
export interface UpdateSheetTabRenameInput { draftName: string }
export interface CommitSheetTabRenameInput { sheetId: string; name: string; source?: SheetTabInteractionSource }
export interface BeginSheetTabReorderInput { sheetId: string; source?: SheetTabInteractionSource }
export interface UpdateSheetTabReorderInput { sheetId: string; beforeSheetId?: string | null; afterSheetId?: string | null; targetIndex?: number | null }
export interface CommitSheetTabReorderInput extends UpdateSheetTabReorderInput {}
export interface ReorderSheetMetadataInput { sheetId: string; beforeSheetId?: string | null; afterSheetId?: string | null; targetIndex?: number | null }
export interface InitializeSheetTabsInput { backend: SpreadsheetBackend; sheets: readonly SpreadsheetSheetMetadata[] }
export interface BeginSheetTabRenameCommandInput { sheetId: string; draftName: string; source?: SheetTabInteractionSource }
export interface CommitSheetTabRenameCommandInput { sheetId: string }
export interface RequestSheetTabDeleteInput { sheetId: string }
export interface CommitSheetTabReorderCommandInput { sheetId: string }

export interface CapturedSheetTabsPorts {
  listSheets?: () => Promise<SheetListResult>
  addSheet?: NonNullable<SpreadsheetBackend['addSheet']>
  renameSheet?: NonNullable<SpreadsheetBackend['renameSheet']>
  deleteSheet?: NonNullable<SpreadsheetBackend['deleteSheet']>
  reorderSheet?: NonNullable<SpreadsheetBackend['reorderSheet']>
}

export interface SheetTabMutationPlan extends SheetTabMutationState {
  activeSheetAuthorityWitnessAtDispatch?: WorkspaceActiveSheetAuthorityWitness
  name?: string
  beforeSheetId?: string | null
  afterSheetId?: string | null
  targetIndex?: number | null
}
