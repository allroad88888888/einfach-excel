/** @jsxImportSource solid-js */

import { Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  closeValidationRuleEditorAtom,
  dataValidationMutationBlockedAtom,
  runDataValidationMutationAtom,
  updateValidationRuleFormAtom,
  validationRuleEditorAtom,
  validationRuleFormAtom,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../i18n'
import { refreshVisibleProjection, useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import {
  focusDataValidationDialog,
  restoreDataValidationFocus,
  trapDataValidationDialogTab,
} from './data-validation-dialog-focus'
import { dataValidationRangeLabel } from './data-validation-dialog-range'
import { ValidationRuleDialogContent } from './ValidationRuleDialogContent'

if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('@einfach/spreadsheet-ui-styles/features/data-validation-dialog.css')
}

export interface SpreadsheetDataValidationDialogProps {
  class?: string
  'data-testid'?: string
  sheetId?: string
}

/** Connects the dialog presentation to existing validation atoms and backend commands. */
export function SpreadsheetDataValidationDialog(props: SpreadsheetDataValidationDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const editor = useAtomValue(validationRuleEditorAtom)
  const form = useAtomValue(validationRuleFormAtom)
  const mutationBlocked = useAtomValue(dataValidationMutationBlockedAtom)
  let dialogElement: HTMLDivElement | undefined
  let returnFocusTarget: HTMLElement | undefined
  let focusGeneration = 0

  const isEditing = () => editor().status === 'editing'
  const actionsDisabled = () => editor().pending || mutationBlocked()
  const rangeLabel = () => dataValidationRangeLabel(editor().range, t('dataValidation.noRange'))

  createEffect<boolean>((wasEditing) => {
    const editing = isEditing()
    if (editing && !wasEditing) {
      returnFocusTarget =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      const generation = ++focusGeneration
      queueMicrotask(() => {
        if (generation === focusGeneration && isEditing()) focusDataValidationDialog(dialogElement)
      })
    }
    if (!editing && wasEditing) {
      const target = returnFocusTarget
      returnFocusTarget = undefined
      focusGeneration += 1
      queueMicrotask(() => restoreDataValidationFocus(target))
    }
    return editing
  }, false)

  createEffect(() => {
    if (!isEditing()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      store.setter(closeValidationRuleEditorAtom)
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  async function handleSave() {
    await store.setter(runDataValidationMutationAtom, {
      action: 'save',
      sheetId: props.sheetId,
      setRule: backend.setValidationRule
        ? (request) => backend.setValidationRule!(request)
        : undefined,
      acceptAcknowledgedResult: (result) =>
        refreshVisibleProjection(store, backend, result.sheetId),
    })
  }

  async function handleClear() {
    await store.setter(runDataValidationMutationAtom, {
      action: 'clear',
      sheetId: props.sheetId,
      clearRule: backend.clearValidationRule
        ? (request) => backend.clearValidationRule!(request)
        : undefined,
      acceptAcknowledgedResult: (result) =>
        refreshVisibleProjection(store, backend, result.sheetId),
    })
  }

  return (
    <Show when={isEditing()}>
      <ValidationRuleDialogContent
        class={props.class}
        data-testid={props['data-testid']}
        dialogRef={(element) => {
          dialogElement = element
        }}
        onDialogKeyDown={(event) => trapDataValidationDialogTab(event, dialogElement)}
        editor={editor}
        form={form}
        rangeLabel={rangeLabel}
        actionsDisabled={actionsDisabled}
        translate={t}
        onUpdate={(patch) => store.setter(updateValidationRuleFormAtom, patch)}
        onClose={() => store.setter(closeValidationRuleEditorAtom)}
        onClear={() => {
          void handleClear()
        }}
        onSave={() => {
          void handleSave()
        }}
      />
    </Show>
  )
}
