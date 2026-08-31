import { useAtomValue, useSetAtom } from '@einfach/solid'
import {
  clearTableDiagnosticAtom,
  lastCreatedTableNameAtom,
  lastToggledTableTotalsAtom,
  tableDiagnosticAtom,
} from '@einfach/spreadsheet-ui-core'
import { Show } from 'solid-js'

export interface SpreadsheetTablesFeedbackProps {
  class?: string
  'data-testid'?: string
}

/**
 * Renders user-visible table command outcomes from UI-core atoms.
 *
 * This surface intentionally owns no table state or backend calls. Hosts may
 * mount it beside the table command entry points; the command atoms remain
 * the sole lifecycle authority for creation, totals changes, and failures.
 */
export function SpreadsheetTablesFeedback(props: SpreadsheetTablesFeedbackProps) {
  const lastCreatedTableName = useAtomValue(lastCreatedTableNameAtom)
  const lastToggledTableTotals = useAtomValue(lastToggledTableTotalsAtom)
  const tableDiagnostic = useAtomValue(tableDiagnosticAtom)
  const clearDiagnostic = useSetAtom(clearTableDiagnosticAtom)
  const testId = () => props['data-testid'] ?? 'tables-feedback'
  const className = () => `spreadsheet-tables-feedback${props.class ? ` ${props.class}` : ''}`

  return (
    <section class={className()} aria-label="Table activity" data-testid={testId()}>
      <Show when={lastCreatedTableName()}>
        {(name) => (
          <p
            role="status"
            aria-live="polite"
            data-testid="tables-create-result"
            data-table-name={name()}
          >
            Created table {name()}.
          </p>
        )}
      </Show>
      <Show when={lastToggledTableTotals()}>
        {(totals) => (
          <p
            role="status"
            aria-live="polite"
            data-testid="tables-totals-result"
            data-table-name={totals().name}
            data-has-totals={totals().hasTotals ? 'true' : 'false'}
          >
            Totals row {totals().hasTotals ? 'enabled' : 'disabled'} for {totals().name}.
          </p>
        )}
      </Show>
      <Show when={tableDiagnostic()}>
        {(diagnostic) => (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="tables-diagnostic"
            data-table-diagnostic-code={diagnostic().code}
          >
            <p>{diagnostic().message}</p>
            <button
              type="button"
              data-testid="tables-diagnostic-dismiss"
              aria-label="Dismiss table message"
              onClick={() => clearDiagnostic()}
            >
              Dismiss
            </button>
          </div>
        )}
      </Show>
    </section>
  )
}
