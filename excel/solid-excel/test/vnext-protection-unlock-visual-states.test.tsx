/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetBackend, VerifySheetProtectionPort } from '@einfach/spreadsheet-ui-core'
import { openProtectionUnlockAtom, setSheetProtectionAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetProtectionUnlockDialog } from '../src/protection'

afterEach(cleanup)

const target = {
  sheetId: 'sheet-1',
  range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
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

describe('SpreadsheetProtectionUnlockDialog visual states', () => {
  it('exposes locked, pending, and retryable-error states without changing atom ownership', async () => {
    const store = createStore()
    store.setter(setSheetProtectionAtom, {
      sheetId: target.sheetId,
      state: { mode: 'protected', unlockedRanges: [] },
    })
    store.setter(openProtectionUnlockAtom, target)

    let rejectPassword!: (result: { ok: false; message: string }) => void
    const verification = new Promise<{ ok: false; message: string }>((resolve) => {
      rejectPassword = resolve
    })
    const verify = vi.fn<VerifySheetProtectionPort>(() => verification)
    const view = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetProtectionUnlockDialog verifySheetProtection={verify} />
      </SpreadsheetUiProvider>
    ))

    const dialog = view.getByTestId('protection-unlock-dialog')
    const input = view.getByTestId('protection-unlock-password') as HTMLInputElement
    const confirm = view.getByTestId('protection-unlock-confirm') as HTMLButtonElement
    expect(dialog.getAttribute('data-lock-state')).toBe('locked')
    expect(dialog.getAttribute('data-phase')).toBe('editing')
    expect(dialog.getAttribute('aria-busy')).toBe('false')
    expect(dialog.querySelector('.protection-unlock-header')).toBeTruthy()

    fireEvent.click(confirm)
    await waitFor(() => expect(dialog.getAttribute('data-phase')).toBe('verifying'))
    expect(dialog.getAttribute('aria-busy')).toBe('true')
    expect(input.disabled).toBe(true)
    expect(confirm.disabled).toBe(true)

    rejectPassword({ ok: false, message: 'Incorrect password.' })
    await waitFor(() => expect(dialog.getAttribute('data-phase')).toBe('editing'))
    expect(dialog.getAttribute('aria-busy')).toBe('false')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(view.getByTestId('protection-unlock-error').getAttribute('role')).toBe('alert')
  })
})
