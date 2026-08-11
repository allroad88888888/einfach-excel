import { atom } from '@einfach/core'
import { blockedMutationState } from './mutation-domain'
import {
  closeNameManagerEditor,
  managerDraftEntry,
  nameManagerEditorAtom,
  nameManagerSelectedEntryAtom,
  nameManagerSessionIdAtom,
  resetNameManagerDraft,
} from './name-manager-draft'
import { resetNameManagerTableEditorAtom } from './name-manager-table-editor'
import { nextSessionId } from './primitives'
import { copyNamedRange } from './snapshots'
import { namedRangeMutationStateSourceAtom } from './state'
import { runNamedRangeMutationAtom } from './mutation-runner'
import type {
  DeleteNameManagerEntryInput,
  NameManagerEditorState,
  SaveNameManagerInput,
} from './types'

export const openNameManagerAtom = atom(
  (get) => get(nameManagerEditorAtom),
  (get, set, state: NameManagerEditorState): number => {
    const sessionId = nextSessionId(get(nameManagerSessionIdAtom))
    const draft = state.draft === undefined ? undefined : (copyNamedRange(state.draft) ?? undefined)
    const editor: NameManagerEditorState = Object.freeze(
      state.status === 'closed'
        ? { status: 'closed' }
        : draft === undefined
          ? { status: state.status }
          : { status: state.status, draft },
    )
    set(nameManagerSessionIdAtom, sessionId)
    set(nameManagerEditorAtom, editor)
    set(nameManagerSelectedEntryAtom, state.status === 'editing-existing' ? (draft ?? null) : null)
    resetNameManagerDraft(get, set, draft)
    set(resetNameManagerTableEditorAtom, sessionId)
    return sessionId
  },
)
openNameManagerAtom.debugLabel = 'spreadsheet.namedRanges.open'

export const closeNameManagerAtom = atom(
  (get) => get(nameManagerEditorAtom),
  (get, set): void => {
    closeNameManagerEditor(get, set)
    set(resetNameManagerTableEditorAtom, get(nameManagerSessionIdAtom))
  },
)
closeNameManagerAtom.debugLabel = 'spreadsheet.namedRanges.close'

export const saveNameManagerAtom = atom(null, (get, set, input: SaveNameManagerInput): void => {
  if (input.sessionId !== undefined && input.sessionId !== get(nameManagerSessionIdAtom)) return
  const entry =
    input.entry === undefined
      ? managerDraftEntry(get, input.activeSheetId)
      : copyNamedRange(input.entry)
  if (entry === null) {
    set(namedRangeMutationStateSourceAtom, blockedMutationState('名称或引用无效'))
    return
  }
  set(runNamedRangeMutationAtom, {
    source: input.source,
    origin: 'name-manager',
    sessionId: input.sessionId ?? get(nameManagerSessionIdAtom),
    mutation: { action: 'set', name: entry.name, scope: entry.scope, refersTo: entry.refersTo },
  })
})
saveNameManagerAtom.debugLabel = 'spreadsheet.namedRanges.saveManager'

export const deleteNameManagerEntryAtom = atom(
  null,
  (get, set, input: DeleteNameManagerEntryInput): void => {
    if (input.sessionId !== undefined && input.sessionId !== get(nameManagerSessionIdAtom)) return
    const candidate =
      input.entry ?? get(nameManagerSelectedEntryAtom) ?? get(nameManagerEditorAtom).draft
    const entry = candidate === undefined ? null : copyNamedRange(candidate)
    if (entry === null) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('请选择要删除的名称'))
      return
    }
    set(runNamedRangeMutationAtom, {
      source: input.source,
      origin: 'name-manager',
      sessionId: input.sessionId ?? get(nameManagerSessionIdAtom),
      mutation: { action: 'delete', name: entry.name, scope: entry.scope },
    })
  },
)
deleteNameManagerEntryAtom.debugLabel = 'spreadsheet.namedRanges.deleteManagerEntry'
