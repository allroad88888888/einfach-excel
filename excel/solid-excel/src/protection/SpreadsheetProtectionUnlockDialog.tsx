/** @jsxImportSource solid-js */

import { Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../i18n'
import {
  closeProtectionUnlockAtom,
  protectionUnlockPasswordAtom,
  protectionUnlockStateAtom,
  setProtectionUnlockPasswordAtom,
  submitProtectionUnlockAtom,
  type SubmitProtectionUnlockInput,
  type VerifySheetProtectionPort,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import {
  focusProtectionUnlockDialog,
  restoreProtectionUnlockFocus,
  trapProtectionUnlockDialogTab,
} from './protection-unlock-dialog-focus'
import '@einfach/spreadsheet-ui-styles/features/protection-unlock-dialog.css'

export interface SpreadsheetProtectionUnlockDialogProps {
  class?: string
  'data-testid'?: string
  /** Optional host password verifier. A rejection prevents the local unlock commit. */
  verifySheetProtection?: VerifySheetProtectionPort
}

// Protection is UI-core canonical (#40): confirming commits the unlock
// locally and synchronously; the backend, when it implements the optional
// persistence ports, only receives a fire-and-forget mirror. The dialog
// works on every backend, including ones with no protection port at all.
export function SpreadsheetProtectionUnlockDialog(props: SpreadsheetProtectionUnlockDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const state = useAtomValue(protectionUnlockStateAtom)
  const password = useAtomValue(protectionUnlockPasswordAtom)
  let dialogElement: HTMLDivElement | undefined
  let returnFocusTarget: HTMLElement | undefined
  let focusGeneration = 0

  createEffect<boolean>((wasOpen) => {
    const isOpen = state().isOpen
    if (isOpen && !wasOpen) {
      returnFocusTarget =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      const generation = ++focusGeneration
      queueMicrotask(() => {
        if (generation === focusGeneration && state().phase === 'editing') {
          focusProtectionUnlockDialog(dialogElement)
        }
      })
    }
    if (!isOpen && wasOpen) {
      const target = returnFocusTarget
      returnFocusTarget = undefined
      focusGeneration += 1
      queueMicrotask(() => restoreProtectionUnlockFocus(target))
    }
    return isOpen
  }, false)

  createEffect<string | undefined>((previousPhase) => {
    const phase = state().phase
    if (phase === 'editing' && previousPhase === 'verifying') {
      const generation = ++focusGeneration
      queueMicrotask(() => {
        if (generation === focusGeneration && state().phase === 'editing') {
          focusProtectionUnlockDialog(dialogElement)
        }
      })
    }
    return phase
  }, undefined)

  createEffect(() => {
    if (!state().isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        handleClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  function handleClose() {
    store.setter(closeProtectionUnlockAtom)
  }

  function handleUnlock() {
    const verifySheetProtection = props.verifySheetProtection
    const input: SubmitProtectionUnlockInput = {
      ...(verifySheetProtection ? { verifySheetProtection } : {}),
      source: backend,
    }
    store.setter(submitProtectionUnlockAtom, input)
  }

  function targetLabel(): string {
    const target = state().target
    if (!target) return ''
    if (!target.range) {
      return t('protection.unlock.target.sheet', { sheetId: target.sheetId })
    }
    const r = target.range
    return t('protection.unlock.target.range', {
      sheetId: target.sheetId,
      rowStart: r.rowStart + 1,
      rowEnd: r.rowEnd + 1,
      colStart: r.colStart + 1,
      colEnd: r.colEnd + 1,
    })
  }

  return (
    <Show when={state().isOpen}>
      <div
        ref={dialogElement}
        class={`protection-unlock-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'protection-unlock-dialog'}
        data-lock-state="locked"
        data-phase={state().phase}
        role="dialog"
        aria-modal="true"
        aria-label={t('protection.unlock.ariaLabel')}
        aria-busy={state().pending}
        onKeyDown={(event) => trapProtectionUnlockDialogTab(event, dialogElement)}
      >
        <div class="protection-unlock-header">
          <strong class="protection-unlock-title">{t('protection.unlock.ariaLabel')}</strong>
          <button
            type="button"
            class="dialog-close-x"
            data-testid="dialog-close-x"
            aria-label={t('dialog.close.label')}
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <div class="protection-unlock-body">
          <div class="protection-unlock-row">
            <span class="protection-unlock-target" data-testid="protection-unlock-target">
              {targetLabel()}
            </span>
          </div>
          <div class="protection-unlock-row">
            <label class="protection-unlock-label" for="protection-unlock-password">
              {t('protection.unlock.password')}
            </label>
            <input
              id="protection-unlock-password"
              class="protection-unlock-input"
              data-testid="protection-unlock-password"
              type="password"
              value={password()}
              disabled={state().pending}
              aria-invalid={state().error ? 'true' : undefined}
              aria-describedby={state().error ? 'protection-unlock-error' : undefined}
              onInput={(e) => store.setter(setProtectionUnlockPasswordAtom, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUnlock()
                }
              }}
            />
          </div>

          <Show when={state().error}>
            <div class="protection-unlock-error" data-testid="protection-unlock-error" role="alert">
              {state().error}
            </div>
          </Show>
        </div>

        <div class="protection-unlock-actions">
          <button
            type="button"
            class="protection-unlock-btn protection-unlock-btn-primary"
            data-testid="protection-unlock-confirm"
            disabled={state().pending}
            onClick={handleUnlock}
          >
            {t('protection.unlock.confirm')}
          </button>
          <button
            type="button"
            class="protection-unlock-btn protection-unlock-btn-cancel"
            data-testid="protection-unlock-cancel"
            onClick={handleClose}
          >
            {t('protection.unlock.cancel')}
          </button>
        </div>
      </div>
    </Show>
  )
}
