import { Show, createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { SortConfirmationEntrypoint, SortConfirmationState } from './sort-confirmation-state'
import { formatSortColumn, formatSortRange } from './sort-range-label'

if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('./sort-confirmation-dialog.css')
}

interface SortConfirmationDialogProps {
  readonly anchorRef?: HTMLElement | null | (() => HTMLElement | null | undefined)
  readonly owner?: SortConfirmationEntrypoint
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly onRetry: () => void
  readonly state: SortConfirmationState
  readonly t: (key: string) => string
}

export function SortConfirmationDialog(props: SortConfirmationDialogProps) {
  let dialogRef: HTMLDivElement | undefined
  let primaryActionRef: HTMLButtonElement | undefined
  const owner = () => props.owner ?? 'toolbar'
  const ownsSession = () => {
    const state = props.state
    return state.status !== 'closed' && state.entrypoint === owner()
  }

  const directionLabel = () =>
    props.state.status === 'closed' ? '' : props.t(`toolbar.sort.${props.state.direction}`)

  function anchor(): HTMLElement | null | undefined {
    if (typeof props.anchorRef === 'function') return props.anchorRef()
    if (props.anchorRef) return props.anchorRef
    if (owner() !== 'menu-bar') return null
    return document.querySelector<HTMLButtonElement>('[data-menu-bar-top-button="data"]')
  }

  function restoreAnchorFocus(): void {
    queueMicrotask(() => anchor()?.focus())
  }

  function cancel(): void {
    props.onCancel()
    restoreAnchorFocus()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef) return
    const focusable = Array.from(
      dialogRef.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  createEffect(() => {
    if (!ownsSession()) return
    document.addEventListener('keydown', onKeyDown)
    queueMicrotask(() => primaryActionRef?.focus())
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  return (
    <Show when={ownsSession()}>
      <Portal>
        <div
          class="spreadsheet-sort-confirmation-backdrop"
          data-testid="sort-confirmation-backdrop"
        >
          <div
            ref={dialogRef}
            class="spreadsheet-sort-confirmation-dialog"
            data-testid="sort-confirmation-dialog"
            data-status={props.state.status}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sort-confirmation-title"
            aria-describedby="sort-confirmation-description"
          >
            <div class="spreadsheet-sort-confirmation-header">
              <strong id="sort-confirmation-title">{props.t('toolbar.sort.title')}</strong>
              <button
                type="button"
                data-testid="sort-confirmation-close"
                aria-label="Close sort confirmation"
                onClick={cancel}
              >
                ×
              </button>
            </div>
            <div id="sort-confirmation-description" class="spreadsheet-sort-confirmation-body">
              <Show when={props.state.status === 'preparing'}>
                <p role="status">Resolving sortable range…</p>
              </Show>
              <Show when={props.state.status === 'ready' && props.state}>
                {(state) => {
                  const ready = () => state() as Extract<SortConfirmationState, { status: 'ready' }>
                  return (
                    <>
                      <p data-testid="sort-confirmation-direction">{directionLabel()}</p>
                      <dl>
                        <div>
                          <dt>Range</dt>
                          <dd data-testid="sort-confirmation-range">
                            {formatSortRange(ready().range)}
                          </dd>
                        </div>
                        <div>
                          <dt>Sort column</dt>
                          <dd data-testid="sort-confirmation-column">
                            {formatSortColumn(ready().target.colIndex)}
                          </dd>
                        </div>
                      </dl>
                    </>
                  )
                }}
              </Show>
              <Show when={props.state.status === 'error' && props.state}>
                {(state) => (
                  <p role="alert" data-testid="sort-confirmation-error">
                    {(state() as Extract<SortConfirmationState, { status: 'error' }>).error}
                  </p>
                )}
              </Show>
            </div>
            <div class="spreadsheet-sort-confirmation-actions">
              <button type="button" data-testid="sort-confirmation-cancel" onClick={cancel}>
                Cancel
              </button>
              <Show when={props.state.status === 'error'}>
                <button
                  ref={primaryActionRef}
                  type="button"
                  data-testid="sort-confirmation-retry"
                  onClick={props.onRetry}
                >
                  Retry
                </button>
              </Show>
              <Show when={props.state.status === 'ready'}>
                <button
                  ref={primaryActionRef}
                  type="button"
                  data-testid="sort-confirmation-confirm"
                  onClick={() => {
                    props.onConfirm()
                    restoreAnchorFocus()
                  }}
                >
                  {directionLabel()}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
