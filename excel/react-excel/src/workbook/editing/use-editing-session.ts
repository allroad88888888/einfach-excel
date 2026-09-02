import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  editingDraftAtom,
  editingSessionAtom,
  type EditingCancelIntent,
  type EditingDraftInput,
  type EditingSessionState,
} from '@einfach/spreadsheet-ui-core'
import { useMemo } from 'react'

export interface EditingSession {
  /** The UI-core-owned editing session for the nearest provider. */
  readonly session: EditingSessionState
  /** The writable draft projection from the UI-core-owned editing session. */
  readonly draft: string
  cancel(): EditingCancelIntent | null
  setDraft(input: EditingDraftInput): void
}

/** Reads and dispatches the editing session owned by the nearest WorkbookRuntimeProvider. */
export function useEditingSession(): EditingSession {
  const session = useAtomValue(editingSessionAtom)
  const draft = useAtomValue(editingDraftAtom)
  const setDraft = useSetAtom(editingDraftAtom)
  const cancel = useSetAtom(cancelEditingAtom)

  return useMemo(
    () => ({ session, draft, setDraft, cancel }),
    [cancel, draft, session, setDraft],
  )
}
