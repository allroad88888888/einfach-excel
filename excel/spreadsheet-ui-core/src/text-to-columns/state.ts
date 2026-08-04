import { atom } from '@einfach/core'
import type { Atom, Getter, Setter } from '@einfach/core'
import type { BackendMutationResult, ImportCellChunksRequest, ProjectionRequestId, RangeProjectionRequest } from '../backend/types'
import type { CellCoord, CellRange } from '../shared'
import type { SelectionAuthorityWitness } from '../selection'
import type { WorkspaceActiveSheetAuthorityWitness } from '../workspace'
import { createTextToColumnsPreview } from './preview'
import { effectiveTextToColumnsConfig, previewColumnCount } from './tokenize'
import type {
  TextToColumnsEntrypointState,
  TextToColumnsEntrypointTarget,
  TextToColumnsLifecycleState,
  TextToColumnsPreviewRow,
  TextToColumnsSessionSnapshot,
  TextToColumnsSourceRow,
  TextToColumnsWizardState,
} from './types'
import { DEFAULT_DELIMITED_CONFIG, DEFAULT_FIXED_CONFIG, INITIAL_WIZARD_STATE, nextBlockReason } from './wizard-domain'

export interface TextToColumnsMutationTicket {
  readonly sessionId: number
  readonly requestId: ProjectionRequestId
  readonly sheetId: string
  readonly target: CellRange
  readonly request: ImportCellChunksRequest
  readonly acknowledgement: BackendMutationResult | null
}

export interface TextToColumnsEntrypointTicket {
  readonly operationId: number
  readonly requestId: ProjectionRequestId
  readonly sessionId: number
  readonly session: TextToColumnsSessionSnapshot | null
  readonly open: boolean
  readonly lifecycle: TextToColumnsLifecycleState
  readonly mutation: TextToColumnsMutationTicket | null
  readonly target: TextToColumnsEntrypointTarget
  readonly attempt: number
  readonly request: RangeProjectionRequest
  readonly selectionWitness: SelectionAuthorityWitness
  readonly workspaceWitness: WorkspaceActiveSheetAuthorityWitness
}

export const INITIAL_TEXT_TO_COLUMNS_LIFECYCLE: TextToColumnsLifecycleState = Object.freeze({
  status: 'closed', sessionId: 0, requestId: null, sheetId: null,
})

export const INITIAL_TEXT_TO_COLUMNS_ENTRYPOINT_STATE: TextToColumnsEntrypointState = Object.freeze({
  status: 'idle', operationId: null, requestId: null, sessionId: null, target: null, attempt: 0, error: '',
})

export const EMPTY_TEXT_TO_COLUMNS_SOURCE: readonly TextToColumnsSourceRow[] = Object.freeze([])

export const textToColumnsSourceStateAtom = atom<readonly TextToColumnsSourceRow[]>(EMPTY_TEXT_TO_COLUMNS_SOURCE)
textToColumnsSourceStateAtom.debugLabel = 'spreadsheet.textToColumns.source.state'
export const textToColumnsAnchorStateAtom = atom<CellCoord | null>(null)
textToColumnsAnchorStateAtom.debugLabel = 'spreadsheet.textToColumns.anchor.state'
export const textToColumnsSheetIdStateAtom = atom<string | null>(null)
textToColumnsSheetIdStateAtom.debugLabel = 'spreadsheet.textToColumns.sheetId.state'
export const textToColumnsOpenStateAtom = atom(false)
textToColumnsOpenStateAtom.debugLabel = 'spreadsheet.textToColumns.open.state'
export const textToColumnsWizardStateAtom = atom<TextToColumnsWizardState>(INITIAL_WIZARD_STATE)
textToColumnsWizardStateAtom.debugLabel = 'spreadsheet.textToColumns.wizard.state'
export const textToColumnsSessionIdStateAtom = atom(0)
textToColumnsSessionIdStateAtom.debugLabel = 'spreadsheet.textToColumns.sessionId.state'
export const textToColumnsRequestIdStateAtom = atom(0)
textToColumnsRequestIdStateAtom.debugLabel = 'spreadsheet.textToColumns.requestId.state'
export const textToColumnsSessionStateAtom = atom<TextToColumnsSessionSnapshot | null>(null)
textToColumnsSessionStateAtom.debugLabel = 'spreadsheet.textToColumns.session.state'
export const textToColumnsLifecycleStateAtom = atom<TextToColumnsLifecycleState>(INITIAL_TEXT_TO_COLUMNS_LIFECYCLE)
textToColumnsLifecycleStateAtom.debugLabel = 'spreadsheet.textToColumns.lifecycle.state'
export const textToColumnsErrorStateAtom = atom('')
textToColumnsErrorStateAtom.debugLabel = 'spreadsheet.textToColumns.error.state'
export const textToColumnsCapabilityStateAtom = atom(false)
textToColumnsCapabilityStateAtom.debugLabel = 'spreadsheet.textToColumns.capability.state'
export const activeTextToColumnsMutationAtom = atom<TextToColumnsMutationTicket | null>(null)
activeTextToColumnsMutationAtom.debugLabel = 'spreadsheet.textToColumns.activeMutation'
export const textToColumnsEntrypointOperationIdStateAtom = atom(0)
textToColumnsEntrypointOperationIdStateAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.operationId.state'
export const textToColumnsEntrypointRequestIdStateAtom = atom(0)
textToColumnsEntrypointRequestIdStateAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.requestId.state'
export const textToColumnsEntrypointStateBackingAtom = atom<TextToColumnsEntrypointState>(INITIAL_TEXT_TO_COLUMNS_ENTRYPOINT_STATE)
textToColumnsEntrypointStateBackingAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.state.backing'
export const activeTextToColumnsEntrypointAtom = atom<TextToColumnsEntrypointTicket | null>(null)
activeTextToColumnsEntrypointAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.active'

export const textToColumnsSourceAtom: Atom<readonly TextToColumnsSourceRow[]> = atom((get) => get(textToColumnsSourceStateAtom))
textToColumnsSourceAtom.debugLabel = 'spreadsheet.textToColumns.source'
export const textToColumnsAnchorAtom: Atom<CellCoord | null> = atom((get) => get(textToColumnsAnchorStateAtom))
textToColumnsAnchorAtom.debugLabel = 'spreadsheet.textToColumns.anchor'
export const textToColumnsSheetIdAtom: Atom<string | null> = atom((get) => get(textToColumnsSheetIdStateAtom))
textToColumnsSheetIdAtom.debugLabel = 'spreadsheet.textToColumns.sheetId'
export const textToColumnsOpenAtom: Atom<boolean> = atom((get) => get(textToColumnsOpenStateAtom))
textToColumnsOpenAtom.debugLabel = 'spreadsheet.textToColumns.open'
export const textToColumnsWizardAtom: Atom<TextToColumnsWizardState> = atom((get) => get(textToColumnsWizardStateAtom))
textToColumnsWizardAtom.debugLabel = 'spreadsheet.textToColumns.wizard'
export const textToColumnsSessionIdAtom: Atom<number> = atom((get) => get(textToColumnsSessionIdStateAtom))
textToColumnsSessionIdAtom.debugLabel = 'spreadsheet.textToColumns.sessionId'
export const textToColumnsRequestIdAtom: Atom<number> = atom((get) => get(textToColumnsRequestIdStateAtom))
textToColumnsRequestIdAtom.debugLabel = 'spreadsheet.textToColumns.requestId'
export const textToColumnsSessionAtom: Atom<TextToColumnsSessionSnapshot | null> = atom((get) => get(textToColumnsSessionStateAtom))
textToColumnsSessionAtom.debugLabel = 'spreadsheet.textToColumns.session'
export const textToColumnsLifecycleAtom: Atom<TextToColumnsLifecycleState> = atom((get) => get(textToColumnsLifecycleStateAtom))
textToColumnsLifecycleAtom.debugLabel = 'spreadsheet.textToColumns.lifecycle'
export const textToColumnsErrorAtom: Atom<string> = atom((get) => get(textToColumnsErrorStateAtom))
textToColumnsErrorAtom.debugLabel = 'spreadsheet.textToColumns.error'
export const textToColumnsCapabilityAtom: Atom<boolean> = atom((get) => get(textToColumnsCapabilityStateAtom))
textToColumnsCapabilityAtom.debugLabel = 'spreadsheet.textToColumns.capability'
export const textToColumnsEntrypointStateAtom: Atom<TextToColumnsEntrypointState> = atom((get) => get(textToColumnsEntrypointStateBackingAtom))
textToColumnsEntrypointStateAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.state'

export const textToColumnsPreviewAtom = atom((get): readonly TextToColumnsPreviewRow[] =>
  createTextToColumnsPreview(
    get(textToColumnsSourceAtom),
    effectiveTextToColumnsConfig(get(textToColumnsWizardAtom), { delimited: DEFAULT_DELIMITED_CONFIG, fixed: DEFAULT_FIXED_CONFIG }),
  ),
)
textToColumnsPreviewAtom.debugLabel = 'spreadsheet.textToColumns.preview'
export const textToColumnsColumnCountAtom = atom((get) => previewColumnCount(get(textToColumnsPreviewAtom)))
textToColumnsColumnCountAtom.debugLabel = 'spreadsheet.textToColumns.columnCount'
export const textToColumnsHasSourceAtom = atom((get) => {
  const session = get(textToColumnsSessionAtom)
  return session !== null && session.rows.length !== 0
})
textToColumnsHasSourceAtom.debugLabel = 'spreadsheet.textToColumns.hasSource'
export const textToColumnsNextBlockReasonAtom = atom((get) => nextBlockReason(get(textToColumnsWizardAtom)))
textToColumnsNextBlockReasonAtom.debugLabel = 'spreadsheet.textToColumns.nextBlockReason'
export const textToColumnsCanEditAtom = atom((get) => {
  const lifecycle = get(textToColumnsLifecycleAtom)
  return get(textToColumnsOpenAtom) && get(activeTextToColumnsMutationAtom) === null &&
    (lifecycle.status === 'editing' || lifecycle.status === 'blocked' || lifecycle.status === 'error')
})
textToColumnsCanEditAtom.debugLabel = 'spreadsheet.textToColumns.canEdit'
export const textToColumnsCanGoBackAtom = atom((get) => get(textToColumnsCanEditAtom) && get(textToColumnsWizardAtom).step !== 'step-1')
textToColumnsCanGoBackAtom.debugLabel = 'spreadsheet.textToColumns.canGoBack'
export const textToColumnsCanGoNextAtom = atom((get) => get(textToColumnsCanEditAtom) && get(textToColumnsNextBlockReasonAtom) === null)
textToColumnsCanGoNextAtom.debugLabel = 'spreadsheet.textToColumns.canGoNext'
export const textToColumnsCanFinishAtom = atom((get) => {
  const lifecycle = get(textToColumnsLifecycleAtom)
  const active = get(activeTextToColumnsMutationAtom)
  if (!get(textToColumnsOpenAtom)) return false
  if (active !== null) return lifecycle.status === 'error' && active.acknowledgement !== null
  const wizard = get(textToColumnsWizardAtom)
  return get(textToColumnsCapabilityAtom) && get(textToColumnsHasSourceAtom) && wizard.step === 'step-3' &&
    wizard.formats.some((format) => format !== 'skip') && (lifecycle.status === 'editing' || lifecycle.status === 'error')
})
textToColumnsCanFinishAtom.debugLabel = 'spreadsheet.textToColumns.canFinish'

export function blocksTextToColumnsClose(status: TextToColumnsLifecycleState['status']): boolean {
  return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing' || status === 'outcome-unknown'
}

export const textToColumnsCanCloseAtom = atom((get) =>
  get(textToColumnsOpenAtom) && get(activeTextToColumnsMutationAtom) === null && !blocksTextToColumnsClose(get(textToColumnsLifecycleAtom).status),
)
textToColumnsCanCloseAtom.debugLabel = 'spreadsheet.textToColumns.canClose'

export function lifecycleFor(status: TextToColumnsLifecycleState['status'], sessionId: number, sheetId: string | null, requestId: ProjectionRequestId | null = null): TextToColumnsLifecycleState {
  return Object.freeze({ status, sessionId, requestId, sheetId })
}

export function textToColumnsErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch { /* guarded coercion below */ }
  try { return String(error) } catch { return 'Unknown Text to Columns transport failure.' }
}

export type { Getter, Setter }
