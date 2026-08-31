/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetBackend, VerifySheetProtectionPort } from '@einfach/spreadsheet-ui-core'
import {
  openProtectionUnlockAtom,
  protectionUnlockStateAtom,
  setSheetProtectionAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetProtectionUnlockDialog } from '../src/protection'

afterEach(cleanup)

const target = {
  sheetId: 'sheet-1',
  range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
}

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function renderDialog(
  store: ReturnType<typeof createStore>,
  verifySheetProtection?: VerifySheetProtectionPort,
) {
  let opener: HTMLButtonElement | undefined
  const view = render(() => (
    <SpreadsheetUiProvider backend={createBackend()} store={store}>
      <button ref={opener} type="button" data-testid="unlock-opener">
        Unlock range
      </button>
      <SpreadsheetProtectionUnlockDialog verifySheetProtection={verifySheetProtection} />
    </SpreadsheetUiProvider>
  ))
  return { opener: opener!, view }
}

function protectSheet(store: ReturnType<typeof createStore>) {
  store.setter(setSheetProtectionAtom, {
    sheetId: target.sheetId,
    state: { mode: 'protected', unlockedRanges: [] },
  })
}

describe('SpreadsheetProtectionUnlockDialog focus contract', () => {
  it('moves focus to the password field and restores the opener after Escape', async () => {
    const store = createStore()
    const { opener, view } = renderDialog(store)
    opener.focus()

    store.setter(openProtectionUnlockAtom, target)
    const password = view.getByTestId('protection-unlock-password')
    await waitFor(() => expect(document.activeElement).toBe(password))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('keeps Tab and Shift+Tab inside the unlock dialog', async () => {
    const store = createStore()
    const { view } = renderDialog(store)
    store.setter(openProtectionUnlockAtom, target)
    const dialog = view.getByTestId('protection-unlock-dialog')
    const close = view.getByTestId('dialog-close-x')
    const cancel = view.getByTestId('protection-unlock-cancel')

    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByTestId('protection-unlock-password')),
    )
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)

    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('returns focus to the password field after a verifier error and exposes the error relationship', async () => {
    const store = createStore()
    protectSheet(store)
    const verification = createDeferred<{ ok: boolean; message?: string }>()
    const verify = jest.fn<VerifySheetProtectionPort>(() => verification.promise)
    const { view } = renderDialog(store, verify)
    store.setter(openProtectionUnlockAtom, target)
    const password = view.getByTestId('protection-unlock-password') as HTMLInputElement

    await waitFor(() => expect(document.activeElement).toBe(password))
    fireEvent.click(view.getByTestId('protection-unlock-confirm'))
    await waitFor(() => expect(password.disabled).toBe(true))

    verification.resolve({ ok: false, message: 'Incorrect password.' })
    await waitFor(() => expect(store.getter(protectionUnlockStateAtom).phase).toBe('editing'))
    await waitFor(() => expect(document.activeElement).toBe(password))
    expect(password.getAttribute('aria-invalid')).toBe('true')
    expect(password.getAttribute('aria-describedby')).toBe('protection-unlock-error')
    expect(view.getByTestId('protection-unlock-error').getAttribute('role')).toBe('alert')
  })
})
