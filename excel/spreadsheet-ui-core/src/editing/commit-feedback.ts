import type { EditingCommitLifecycleState } from './types'

/** Error feedback for editing lifecycle states that leave a draft open. */
export interface EditingCommitFeedback {
  readonly kind: 'error'
  readonly message: string
  readonly detail?: string
}

/** Maps editing lifecycle facts to framework-neutral error copy. */
export function editingCommitFeedback(
  lifecycle: EditingCommitLifecycleState,
): EditingCommitFeedback | null {
  switch (lifecycle.status) {
    case 'rejected':
      return {
        kind: 'error',
        message: 'That edit was not saved.',
        detail: lifecycle.error || undefined,
      }
    case 'outcome-unknown':
      return {
        kind: 'error',
        message: 'This edit was not confirmed — it may or may not have been saved.',
        detail: lifecycle.error || undefined,
      }
    case 'refresh-failed':
      return {
        kind: 'error',
        message: 'This edit was saved, but the sheet could not be refreshed.',
        detail: lifecycle.error || undefined,
      }
    case 'ready':
    case 'blocked':
    case 'pending':
    case 'local-acknowledged':
    case 'refreshing':
      return null
  }
}

/** Whether the lifecycle has error feedback that needs host presentation. */
export function isUnresolvedEditingCommit(lifecycle: EditingCommitLifecycleState): boolean {
  return editingCommitFeedback(lifecycle) !== null
}
