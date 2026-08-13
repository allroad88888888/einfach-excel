/** @jsxImportSource solid-js */

import { Show, createEffect, createMemo, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../../src/i18n'
import {
  captureTextToColumnsCapabilityAtom,
  closeTextToColumnsAtom,
  dispatchTextToColumnsIntentAtom,
  runTextToColumnsFinishAtom,
  textToColumnsCanCloseAtom,
  textToColumnsCanEditAtom,
  textToColumnsCanFinishAtom,
  textToColumnsCanGoBackAtom,
  textToColumnsCanGoNextAtom,
  textToColumnsColumnCountAtom,
  textToColumnsErrorAtom,
  textToColumnsHasSourceAtom,
  textToColumnsLifecycleAtom,
  textToColumnsNextBlockReasonAtom,
  textToColumnsOpenAtom,
  textToColumnsPreviewAtom,
  textToColumnsSessionAtom,
  textToColumnsWizardAtom,
  type TextToColumnsIntent,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { createHistoryEntryRecorder } from '../provider/history-entry-recorder'
import { refreshVisibleProjection } from '../provider/projection-refresh'
import { TextToColumnsDialogContent } from './TextToColumnsDialogContent'
import {
  focusTextToColumnsDialog,
  restoreTextToColumnsFocus,
  trapTextToColumnsDialogTab,
} from './text-to-columns-dialog-focus'
import '@einfach/spreadsheet-ui-styles/features/text-to-columns-dialog.css'

export interface SpreadsheetTextToColumnsDialogProps {
  class?: string
  'data-testid'?: string
}

/**
 * Connects the text-to-columns presenter to Core's wizard atoms. Browser-only
 * focus handling lives here; the wizard, preview, errors, and mutation state
 * remain entirely in the Core atom graph.
 */
export function SpreadsheetTextToColumnsDialog(props: SpreadsheetTextToColumnsDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const isOpen = useAtomValue(textToColumnsOpenAtom)
  const wizard = useAtomValue(textToColumnsWizardAtom)
  const preview = useAtomValue(textToColumnsPreviewAtom)
  const session = useAtomValue(textToColumnsSessionAtom)
  const lifecycle = useAtomValue(textToColumnsLifecycleAtom)
  const error = useAtomValue(textToColumnsErrorAtom)
  const hasSource = useAtomValue(textToColumnsHasSourceAtom)
  const columnCount = useAtomValue(textToColumnsColumnCountAtom)
  const nextBlockReason = useAtomValue(textToColumnsNextBlockReasonAtom)
  const canEdit = useAtomValue(textToColumnsCanEditAtom)
  const canClose = useAtomValue(textToColumnsCanCloseAtom)
  const canGoBack = useAtomValue(textToColumnsCanGoBackAtom)
  const canGoNext = useAtomValue(textToColumnsCanGoNextAtom)
  const canFinish = useAtomValue(textToColumnsCanFinishAtom)
  let dialogElement: HTMLDivElement | undefined
  let returnFocusTarget: HTMLElement | undefined

  // The adapter reports method presence; Core owns the resulting eligibility.
  createEffect(() => {
    store.setter(captureTextToColumnsCapabilityAtom, backend)
  })

  createEffect<boolean>((wasOpen) => {
    const open = isOpen()
    if (open && !wasOpen) {
      const activeElement = document.activeElement
      returnFocusTarget = activeElement instanceof HTMLElement ? activeElement : undefined
      queueMicrotask(() => {
        if (isOpen()) focusTextToColumnsDialog(dialogElement)
      })
    }
    if (!open && wasOpen) {
      const target = returnFocusTarget
      returnFocusTarget = undefined
      queueMicrotask(() => restoreTextToColumnsFocus(target))
    }
    return open
  }, false)

  createEffect(() => {
    if (!isOpen()) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (canClose()) store.setter(closeTextToColumnsAtom)
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  const stepLabel = createMemo(() => {
    const state = wizard()
    if (state.step === 'step-1') return t('textToColumns.step1.title')
    if (state.step === 'step-2-delimited') return t('textToColumns.step2.delimited.title')
    if (state.step === 'step-2-fixed') return t('textToColumns.step2.fixed.title')
    return t('textToColumns.step3.title')
  })

  const nextDisabledReason = createMemo(() => {
    if (nextBlockReason() === 'delimiter-required') {
      return t('textToColumns.step2.delimited.needOne')
    }
    if (nextBlockReason() === 'breakpoint-required') {
      return t('textToColumns.step2.fixed.needOne')
    }
    return undefined
  })

  function dispatch(intent: TextToColumnsIntent) {
    store.setter(dispatchTextToColumnsIntentAtom, intent)
  }

  function handleClose() {
    if (canClose()) store.setter(closeTextToColumnsAtom)
  }

  async function handleFinish() {
    const current = session()
    if (current === null) return
    await store.setter(runTextToColumnsFinishAtom, {
      source: backend,
      sessionId: current.sessionId,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId),
    })
  }

  return (
    <Show when={isOpen()}>
      <TextToColumnsDialogContent
        class={props.class}
        data-testid={props['data-testid']}
        dialogRef={(element) => {
          dialogElement = element
        }}
        onDialogKeyDown={(event) => trapTextToColumnsDialogTab(event, dialogElement)}
        wizard={wizard}
        preview={preview}
        lifecycle={lifecycle}
        error={error}
        hasSource={hasSource}
        columnCount={columnCount}
        canEdit={canEdit}
        canClose={canClose}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        canFinish={canFinish}
        stepLabel={stepLabel}
        nextDisabledReason={nextDisabledReason}
        onIntent={dispatch}
        onClose={handleClose}
        onBack={() => dispatch({ kind: 'back' })}
        onNext={() => dispatch({ kind: 'next' })}
        onFinish={() => void handleFinish()}
      />
    </Show>
  )
}
