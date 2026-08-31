import type { SpreadsheetWorkbookLifecycle } from '../provider/atoms'
import type { SpreadsheetFeedback } from '../feedback/types'

/** Projects the Provider-owned workbook lifecycle into shared feedback copy. */
export function workbookLifecycleFeedback(
  lifecycle: SpreadsheetWorkbookLifecycle,
): SpreadsheetFeedback | null {
  switch (lifecycle.phase) {
    case 'initializing':
      return { kind: 'loading', message: 'Loading workbook…' }
    case 'failed':
      return {
        kind: 'error',
        message: 'Workbook could not be loaded.',
        detail: lifecycle.error ?? undefined,
      }
    case 'idle':
    case 'ready':
      return null
  }
}
