import { Show, type Accessor } from 'solid-js'

interface MenuBarStatusProps {
  filterSortEntrypoint: Accessor<{ status: string; error?: string | null }>
  lastCreatedTableName: Accessor<string | null>
  lastToggledTableTotals: Accessor<{ name: string; hasTotals: boolean } | null>
  tableDiagnostic: Accessor<{ code: string; message: string } | null>
  textToColumnsEntrypoint: Accessor<{
    status: string
    error?: string | null
    canRetry: boolean
  }>
  onRetryFilterSort: () => void
  onRetryTextToColumns: () => void
}

/** Displays menu-owned Core command status without adding local product state. */
export function MenuBarStatus(props: MenuBarStatusProps) {
  return (
    <>
      <Show when={props.filterSortEntrypoint().error}>
        {(error) => (
          <span role="status" data-testid="menu-bar-filter-sort-status">
            {error()}
          </span>
        )}
      </Show>
      <Show when={props.filterSortEntrypoint().status === 'refresh-failed'}>
        <button
          type="button"
          data-testid="menu-bar-filter-sort-refresh-retry"
          aria-label="Retry filter and sort refresh"
          onClick={props.onRetryFilterSort}
        >
          ↻
        </button>
      </Show>
      <Show when={props.textToColumnsEntrypoint().status === 'loading'}>
        <span role="status" data-testid="menu-bar-text-to-columns-loading">
          Loading Text to Columns source…
        </span>
      </Show>
      <Show when={props.textToColumnsEntrypoint().error}>
        {(error) => (
          <span role="status" data-testid="menu-bar-text-to-columns-status">
            {error()}
          </span>
        )}
      </Show>
      <Show when={props.textToColumnsEntrypoint().canRetry}>
        <button
          type="button"
          data-testid="menu-bar-text-to-columns-retry"
          aria-label="Retry loading Text to Columns source"
          onClick={props.onRetryTextToColumns}
        >
          ↻
        </button>
      </Show>
      <Show when={props.lastCreatedTableName()}>
        {(name) => (
          <span role="status" data-testid="menu-bar-create-table-status" data-table-name={name()}>
            {name()}
          </span>
        )}
      </Show>
      <Show when={props.lastToggledTableTotals()}>
        {(totals) => (
          <span
            role="status"
            data-testid="menu-bar-toggle-totals-status"
            data-table-name={totals().name}
            data-has-totals={totals().hasTotals ? 'true' : 'false'}
          >
            {totals().name}
          </span>
        )}
      </Show>
      <Show when={props.tableDiagnostic()}>
        {(diagnostic) => (
          <span
            role="status"
            data-testid="menu-bar-create-table-error"
            data-table-diagnostic-code={diagnostic().code}
          >
            {diagnostic().message}
          </span>
        )}
      </Show>
    </>
  )
}
