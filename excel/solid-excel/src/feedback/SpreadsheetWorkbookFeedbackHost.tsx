import { SpreadsheetDiagnostics } from '../diagnostics'
import { SpreadsheetWorkbookRecovery } from '../recovery'
import { SpreadsheetEditingCommitFeedback } from './SpreadsheetEditingCommitFeedback'

export interface SpreadsheetWorkbookFeedbackHostProps {
  class?: string
  'data-testid'?: string
}

/**
 * Projects the existing Atom-owned diagnostic and workbook-lifecycle feedback
 * into one workbook Chrome region. Recovery remains caller-owned: this host
 * deliberately supplies no retry command because it cannot replace a backend.
 */
export function SpreadsheetWorkbookFeedbackHost(props: SpreadsheetWorkbookFeedbackHostProps) {
  const testId = () => props['data-testid'] ?? 'workbook-feedback-host'

  return (
    <div
      class={`spreadsheet-workbook-feedback-host${props.class ? ` ${props.class}` : ''}`}
      data-testid={testId()}
    >
      <SpreadsheetWorkbookRecovery data-testid={`${testId()}-recovery`} />
      <SpreadsheetEditingCommitFeedback data-testid={`${testId()}-editing-commit`} />
      <SpreadsheetDiagnostics class="spreadsheet-workbook-feedback-host-diagnostics" />
    </div>
  )
}
