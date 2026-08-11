import { useAtomValue } from '@einfach/solid'
import { editingCommitLifecycleAtom } from '@einfach/spreadsheet-ui-core'

/** Projects the shared editing lifecycle into formula-bar error feedback. */
export function useFormulaBarCommitFeedback() {
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)

  const isRejected = () => lifecycle().status === 'rejected'
  const error = () => (isRejected() ? lifecycle().error : '')

  return { isRejected, error }
}
