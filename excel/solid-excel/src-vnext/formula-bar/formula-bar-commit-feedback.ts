import { useAtomValue } from '@einfach/solid'
import { editingCommitLifecycleAtom } from '@einfach/spreadsheet-ui-core'
import { editingCommitFeedback } from '../feedback/editing-commit-feedback'

/**
 * Projects the shared editing lifecycle into formula-bar error feedback.
 *
 * Covers every terminal state that leaves the draft open, not just `rejected`:
 * a commit that timed out (`outcome-unknown`) parks the formula bar in exactly
 * the same "your text is still here and nothing happened" position, and used
 * to do it without a word of explanation.
 */
export function useFormulaBarCommitFeedback() {
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const feedback = () => editingCommitFeedback(lifecycle())

  const isRejected = () => feedback() !== null
  const error = () => {
    const current = feedback()
    if (current === null) return ''
    // The lifecycle's own detail is the specific one; fall back to the shared
    // copy so the bar is never flagged invalid with an empty message.
    return lifecycle().error || current.message
  }

  return { isRejected, error }
}
