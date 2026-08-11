import { atom } from '@einfach/core'

export interface NameManagerTableEditorState {
  readonly sessionId: number
  readonly renamingTable: string | null
  readonly renameDraft: string
  readonly pendingDeleteTable: string | null
}

const INITIAL_STATE: NameManagerTableEditorState = Object.freeze({
  sessionId: 0,
  renamingTable: null,
  renameDraft: '',
  pendingDeleteTable: null,
})

export const nameManagerTableEditorAtom = atom<NameManagerTableEditorState>(INITIAL_STATE)
nameManagerTableEditorAtom.debugLabel = 'spreadsheet.namedRanges.tableEditor'

export const resetNameManagerTableEditorAtom = atom(null, (_get, set, sessionId: number): void => {
  set(nameManagerTableEditorAtom, Object.freeze({ ...INITIAL_STATE, sessionId }))
})

export const beginNameManagerTableRenameAtom = atom(
  null,
  (get, set, input: { readonly sessionId: number; readonly name: string }): void => {
    const current = get(nameManagerTableEditorAtom)
    if (current.sessionId !== input.sessionId) return
    set(
      nameManagerTableEditorAtom,
      Object.freeze({
        ...current,
        renamingTable: input.name,
        renameDraft: input.name,
        pendingDeleteTable: null,
      }),
    )
  },
)

export const updateNameManagerTableRenameDraftAtom = atom(
  null,
  (get, set, input: { readonly sessionId: number; readonly value: string }): void => {
    const current = get(nameManagerTableEditorAtom)
    if (current.sessionId === input.sessionId && current.renamingTable !== null) {
      set(nameManagerTableEditorAtom, Object.freeze({ ...current, renameDraft: input.value }))
    }
  },
)

export const cancelNameManagerTableRenameAtom = atom(null, (get, set, sessionId: number): void => {
  const current = get(nameManagerTableEditorAtom)
  if (current.sessionId === sessionId) {
    set(
      nameManagerTableEditorAtom,
      Object.freeze({ ...current, renamingTable: null, renameDraft: '' }),
    )
  }
})

export const setNameManagerTablePendingDeleteAtom = atom(
  null,
  (get, set, input: { readonly sessionId: number; readonly name: string | null }): void => {
    const current = get(nameManagerTableEditorAtom)
    if (current.sessionId === input.sessionId) {
      set(nameManagerTableEditorAtom, Object.freeze({ ...current, pendingDeleteTable: input.name }))
    }
  },
)

export const settleNameManagerTableRenameAtom = atom(
  null,
  (
    get,
    set,
    input: { readonly sessionId: number; readonly from: string; readonly to: string },
  ): void => {
    const current = get(nameManagerTableEditorAtom)
    if (current.sessionId === input.sessionId && current.renamingTable === input.from) {
      set(
        nameManagerTableEditorAtom,
        Object.freeze({ ...current, renamingTable: null, renameDraft: '' }),
      )
    }
  },
)
