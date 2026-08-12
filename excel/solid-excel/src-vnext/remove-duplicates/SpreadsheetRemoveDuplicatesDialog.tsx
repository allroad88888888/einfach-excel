/** @jsxImportSource solid-js */

import { Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  captureRemoveDuplicatesCapabilityAtom,
  closeRemoveDuplicatesAtom,
  dispatchRemoveDuplicatesIntentAtom,
  removeDuplicatesBusyAtom,
  removeDuplicatesCanCloseAtom,
  removeDuplicatesCanConfirmAtom,
  removeDuplicatesCanEditAtom,
  removeDuplicatesCanRetryReadAtom,
  removeDuplicatesComparisonAtom,
  removeDuplicatesErrorAtom,
  removeDuplicatesExcludeHeaderAtom,
  removeDuplicatesKeyColumnsAtom,
  removeDuplicatesLifecycleAtom,
  removeDuplicatesOpenAtom,
  removeDuplicatesPreviewAtom,
  removeDuplicatesRangeAtom,
  removeDuplicatesScanInputCellsAtom,
  removeDuplicatesSessionAtom,
  retryRemoveDuplicatesReadAtom,
  runRemoveDuplicatesConfirmAtom,
  type RemoveDuplicatesComparison,
} from '@einfach/spreadsheet-ui-core'
import { useOverlayInteraction } from '../overlay'
import {
  createHistoryEntryRecorder,
  refreshVisibleProjection,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import {
  REMOVE_DUPLICATES_DIALOG_ERROR_ID,
  REMOVE_DUPLICATES_DIALOG_PREVIEW_ID,
  REMOVE_DUPLICATES_DIALOG_TITLE_ID,
  RemoveDuplicatesDialogContent,
} from './RemoveDuplicatesDialogContent'

if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('./remove-duplicates-dialog.css')
}

export interface SpreadsheetRemoveDuplicatesDialogProps {
  class?: string
  'data-testid'?: string
}

/** Connects the Remove Duplicates dialog to its feature-owned Atom commands. */
export function SpreadsheetRemoveDuplicatesDialog(props: SpreadsheetRemoveDuplicatesDialogProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const isOpen = useAtomValue(removeDuplicatesOpenAtom)
  const range = useAtomValue(removeDuplicatesRangeAtom)
  const cells = useAtomValue(removeDuplicatesScanInputCellsAtom)
  const keyColumns = useAtomValue(removeDuplicatesKeyColumnsAtom)
  const comparison = useAtomValue(removeDuplicatesComparisonAtom)
  const excludeHeader = useAtomValue(removeDuplicatesExcludeHeaderAtom)
  const preview = useAtomValue(removeDuplicatesPreviewAtom)
  const session = useAtomValue(removeDuplicatesSessionAtom)
  const lifecycle = useAtomValue(removeDuplicatesLifecycleAtom)
  const error = useAtomValue(removeDuplicatesErrorAtom)
  const canEdit = useAtomValue(removeDuplicatesCanEditAtom)
  const canClose = useAtomValue(removeDuplicatesCanCloseAtom)
  const canConfirm = useAtomValue(removeDuplicatesCanConfirmAtom)
  const canRetryRead = useAtomValue(removeDuplicatesCanRetryReadAtom)
  const busy = useAtomValue(removeDuplicatesBusyAtom)
  let closeButton: HTMLButtonElement | undefined

  createEffect(() => {
    store.setter(captureRemoveDuplicatesCapabilityAtom, backend)
  })

  function handleClose() {
    store.setter(closeRemoveDuplicatesAtom)
  }

  const overlay = useOverlayInteraction({
    active: isOpen,
    initialFocus: () => (closeButton?.disabled ? undefined : closeButton),
    onRequestClose: handleClose,
  })

  function handleConfirm() {
    if (!canConfirm()) return
    const sessionId = session()?.sessionId
    if (sessionId === undefined) return
    void store.setter(runRemoveDuplicatesConfirmAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      sessionId,
      refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId, 'toolbar'),
    })
  }

  function handleRetryRead() {
    if (!canRetryRead()) return
    void store.setter(retryRemoveDuplicatesReadAtom, { source: backend })
  }

  function dispatchIntent(
    intent:
      | { readonly kind: 'set-exclude-header'; readonly excludeHeader: boolean }
      | { readonly kind: 'toggle-key-column'; readonly column: number }
      | { readonly kind: 'select-all-key-columns' }
      | { readonly kind: 'deselect-all-key-columns' }
      | { readonly kind: 'set-comparison'; readonly comparison: RemoveDuplicatesComparison },
  ) {
    store.setter(dispatchRemoveDuplicatesIntentAtom, intent)
  }

  return (
    <Show when={isOpen()}>
      <form
        ref={overlay.overlayRef}
        class={`remove-duplicates-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'remove-duplicates-dialog'}
        data-status={lifecycle().status}
        role="dialog"
        aria-modal="true"
        aria-labelledby={REMOVE_DUPLICATES_DIALOG_TITLE_ID}
        aria-describedby={
          error().length > 0
            ? REMOVE_DUPLICATES_DIALOG_ERROR_ID
            : REMOVE_DUPLICATES_DIALOG_PREVIEW_ID
        }
        aria-busy={busy()}
        onSubmit={(event) => {
          event.preventDefault()
          handleConfirm()
        }}
      >
        <RemoveDuplicatesDialogContent
          range={range}
          cells={cells}
          keyColumns={keyColumns}
          comparison={comparison}
          excludeHeader={excludeHeader}
          preview={preview}
          error={error}
          canEdit={canEdit}
          canClose={canClose}
          canConfirm={canConfirm}
          canRetryRead={canRetryRead}
          setCloseButtonRef={(element) => {
            closeButton = element
          }}
          onSetExcludeHeader={(next) =>
            dispatchIntent({ kind: 'set-exclude-header', excludeHeader: next })
          }
          onToggleColumn={(column) => dispatchIntent({ kind: 'toggle-key-column', column })}
          onSelectAllColumns={() => dispatchIntent({ kind: 'select-all-key-columns' })}
          onDeselectAllColumns={() => dispatchIntent({ kind: 'deselect-all-key-columns' })}
          onSetComparison={(next) => dispatchIntent({ kind: 'set-comparison', comparison: next })}
          onClose={handleClose}
          onRetryRead={handleRetryRead}
        />
      </form>
    </Show>
  )
}
