import type { Store } from '@einfach/core'
import {
  cancelEditingAtom,
  commitEditingAtom,
  editingDraftAtom,
  editingSessionAtom,
  startEditingAtom,
  type EditingCancelIntent,
  type EditingCommitInput,
  type EditingCommitIntent,
  type EditingDraftInput,
  type EditingSessionState,
  type EditingStartInput,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useWorkbookRuntime } from '../runtime/use-workbook-runtime'
import { useStoreValue, type StoreValueSource } from '../runtime/use-store-value'

export interface EditingSession {
  /** The UI-core-owned editing session for the nearest provider. */
  readonly session: EditingSessionState
  /** The writable draft projection from the UI-core-owned editing session. */
  readonly draft: string
  cancel(): EditingCancelIntent | null
  commit(input: EditingCommitInput): EditingCommitIntent | null
  setDraft(input: EditingDraftInput): void
  start(input: EditingStartInput): EditingSessionState
}

function createEditingSessionSource(store: Store): StoreValueSource<EditingSessionState> {
  return {
    getSnapshot: () => store.getter(editingSessionAtom),
    subscribe: (onStoreChange) => store.sub(editingSessionAtom, onStoreChange),
  }
}

function createEditingDraftSource(store: Store): StoreValueSource<string> {
  return {
    getSnapshot: () => store.getter(editingDraftAtom),
    subscribe: (onStoreChange) => store.sub(editingDraftAtom, onStoreChange),
  }
}

/** Reads and dispatches the editing session owned by the nearest WorkbookRuntimeProvider. */
export function useEditingSession(): EditingSession {
  const { store } = useWorkbookRuntime()
  const sessionSource = useMemo(() => createEditingSessionSource(store), [store])
  const draftSource = useMemo(() => createEditingDraftSource(store), [store])
  const session = useStoreValue(sessionSource)
  const draft = useStoreValue(draftSource)

  const start = useCallback(
    (input: EditingStartInput) => store.setter(startEditingAtom, input),
    [store],
  )
  const setDraft = useCallback(
    (input: EditingDraftInput) => store.setter(editingDraftAtom, input),
    [store],
  )
  const commit = useCallback(
    (input: EditingCommitInput) => store.setter(commitEditingAtom, input),
    [store],
  )
  const cancel = useCallback(() => store.setter(cancelEditingAtom), [store])

  return useMemo(
    () => ({ session, draft, start, setDraft, commit, cancel }),
    [cancel, commit, draft, session, setDraft, start],
  )
}
