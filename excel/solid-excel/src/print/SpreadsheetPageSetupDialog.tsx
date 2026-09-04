/** @jsxImportSource solid-js */

import { Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  cancelPageSetupAtom,
  pageSetupCanCancelAtom,
  pageSetupCanEditAtom,
  pageSetupCanRetryRefreshAtom,
  pageSetupDialogOpenAtom,
  pageSetupSessionAtom,
  retryPageSetupRefreshAtom,
  runPageSetupSaveAtom,
  updatePageSetupDraftAtom,
  type PrintScale,
} from '@einfach/spreadsheet-ui-core'
import { useOverlayInteraction } from '../overlay'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'

if (typeof process === 'undefined' || process.env.VITEST !== 'true') {
  void import('@einfach/spreadsheet-ui-styles/features/page-setup-dialog.css')
}

const PAGE_SETUP_DIALOG_TITLE_ID = 'spreadsheet-page-setup-title'
const PAGE_SETUP_DIALOG_ERROR_ID = 'spreadsheet-page-setup-error'

export interface SpreadsheetPageSetupDialogProps {
  readonly anchor?: () => HTMLElement | undefined
  readonly class?: string
  readonly 'data-testid'?: string
}

function numericValue(value: string, minimum: number): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum ? number : null
}

function scaleLabel(scale: PrintScale): string {
  if (scale.kind === 'percent') return `${scale.percent}%`
  return 'Fit to pages'
}

/** Renders the Atom-owned print setup draft and dispatches its feature commands. */
export function SpreadsheetPageSetupDialog(props: SpreadsheetPageSetupDialogProps) {
  let closeButton: HTMLButtonElement | undefined
  let retryButton: HTMLButtonElement | undefined
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const dialogOpen = useAtomValue(pageSetupDialogOpenAtom)
  const session = useAtomValue(pageSetupSessionAtom)
  const canEdit = useAtomValue(pageSetupCanEditAtom)
  const canCancel = useAtomValue(pageSetupCanCancelAtom)
  const canRetryRefresh = useAtomValue(pageSetupCanRetryRefreshAtom)
  const draft = () => session()?.draft
  const percentScale = () => {
    const scale = draft()?.scale
    return scale?.kind === 'percent' ? scale : null
  }
  const fitScale = () => {
    const scale = draft()?.scale
    return scale?.kind === 'fit' ? scale : null
  }
  const busy = () => session()?.phase === 'saving' || session()?.phase === 'refreshing'

  function close() {
    store.setter(cancelPageSetupAtom)
  }

  function save() {
    if (!canEdit()) return
    void store.setter(runPageSetupSaveAtom, { source: backend })
  }

  function retryRefresh() {
    if (!canRetryRefresh()) return
    void store.setter(retryPageSetupRefreshAtom, { source: backend })
  }

  function setPercent(percent: number) {
    store.setter(updatePageSetupDraftAtom, { scale: { kind: 'percent', percent } })
  }

  function setFitValue(key: 'pagesWide' | 'pagesTall', value: number) {
    const scale = draft()?.scale
    if (scale?.kind !== 'fit') return
    store.setter(updatePageSetupDraftAtom, { scale: { ...scale, [key]: value } })
  }

  const overlay = useOverlayInteraction({
    active: () => session() !== null,
    anchor: props.anchor,
    initialFocus: () => closeButton ?? retryButton,
    onRequestClose: close,
  })

  return (
    <Show when={dialogOpen() && session() !== null}>
      <form
        ref={overlay.overlayRef}
        class={`spreadsheet-page-setup-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'spreadsheet-page-setup-dialog'}
        data-status={session()?.phase}
        role="dialog"
        aria-modal="true"
        aria-labelledby={PAGE_SETUP_DIALOG_TITLE_ID}
        aria-describedby={session()?.error ? PAGE_SETUP_DIALOG_ERROR_ID : undefined}
        aria-busy={busy()}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <header class="page-setup-header">
          <h2 id={PAGE_SETUP_DIALOG_TITLE_ID}>Page setup</h2>
          <button
            ref={closeButton}
            type="button"
            class="dialog-close-x"
            data-testid="page-setup-close-x"
            aria-label="Close page setup"
            disabled={!canCancel()}
            onClick={close}
          >
            ×
          </button>
        </header>

        <div class="page-setup-body">
          <fieldset class="page-setup-fieldset page-setup-orientation" disabled={!canEdit()}>
            <legend>Orientation</legend>
            <label>
              <input
                type="radio"
                name="page-setup-orientation"
                data-testid="page-setup-orientation-portrait"
                checked={draft()?.orientation === 'portrait'}
                onChange={() => store.setter(updatePageSetupDraftAtom, { orientation: 'portrait' })}
              />
              Portrait
            </label>
            <label>
              <input
                type="radio"
                name="page-setup-orientation"
                data-testid="page-setup-orientation-landscape"
                checked={draft()?.orientation === 'landscape'}
                onChange={() =>
                  store.setter(updatePageSetupDraftAtom, { orientation: 'landscape' })
                }
              />
              Landscape
            </label>
          </fieldset>

          <fieldset class="page-setup-fieldset page-setup-scaling" disabled={!canEdit()}>
            <legend>Scaling</legend>
            <div class="page-setup-scale-choice">
              <label>
                <input
                  type="radio"
                  name="page-setup-scale"
                  data-testid="page-setup-scale-percent"
                  checked={draft()?.scale.kind === 'percent'}
                  onChange={() => setPercent(percentScale()?.percent ?? 100)}
                />
                Percent
              </label>
              <input
                type="number"
                min="1"
                step="1"
                data-testid="page-setup-scale-percent-input"
                aria-label="Percent scale"
                disabled={!canEdit() || draft()?.scale.kind !== 'percent'}
                value={percentScale()?.percent ?? ''}
                onInput={(event) => {
                  const value = numericValue(event.currentTarget.value, 1)
                  if (value !== null) setPercent(value)
                }}
              />
              <span>%</span>
            </div>
            <div class="page-setup-scale-choice">
              <label>
                <input
                  type="radio"
                  name="page-setup-scale"
                  data-testid="page-setup-scale-fit"
                  checked={draft()?.scale.kind === 'fit'}
                  onChange={() =>
                    store.setter(updatePageSetupDraftAtom, {
                      scale: { kind: 'fit', pagesWide: 1, pagesTall: 1 },
                    })
                  }
                />
                Fit to
              </label>
              <input
                type="number"
                min="1"
                step="1"
                data-testid="page-setup-fit-wide-input"
                aria-label="Pages wide"
                disabled={!canEdit() || draft()?.scale.kind !== 'fit'}
                value={fitScale()?.pagesWide ?? ''}
                onInput={(event) => {
                  const value = numericValue(event.currentTarget.value, 1)
                  if (value !== null) setFitValue('pagesWide', value)
                }}
              />
              <span>page(s) wide</span>
              <input
                type="number"
                min="1"
                step="1"
                data-testid="page-setup-fit-tall-input"
                aria-label="Pages tall"
                disabled={!canEdit() || draft()?.scale.kind !== 'fit'}
                value={fitScale()?.pagesTall ?? ''}
                onInput={(event) => {
                  const value = numericValue(event.currentTarget.value, 1)
                  if (value !== null) setFitValue('pagesTall', value)
                }}
              />
              <span>page(s) tall</span>
            </div>
            <output data-testid="page-setup-scale-summary">
              {draft() ? scaleLabel(draft()!.scale) : ''}
            </output>
          </fieldset>

          <Show when={session()?.error}>
            <div id={PAGE_SETUP_DIALOG_ERROR_ID} class="page-setup-error" role="alert">
              {session()?.error}
            </div>
          </Show>
        </div>

        <footer class="page-setup-footer">
          <Show when={busy()}>
            <span class="page-setup-pending" data-testid="page-setup-pending" aria-hidden="true">
              <span class="page-setup-pending-indicator" />
            </span>
          </Show>
          <Show when={canRetryRefresh()}>
            <button
              ref={retryButton}
              type="button"
              class="page-setup-button"
              data-testid="page-setup-retry-refresh"
              onClick={retryRefresh}
            >
              Refresh saved settings
            </button>
          </Show>
          <button
            type="button"
            class="page-setup-button"
            data-testid="page-setup-cancel-button"
            disabled={!canCancel()}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="page-setup-button page-setup-button-primary"
            data-testid="page-setup-save-button"
            data-variant="primary"
            disabled={!canEdit()}
          >
            Save
          </button>
        </footer>
      </form>
    </Show>
  )
}
