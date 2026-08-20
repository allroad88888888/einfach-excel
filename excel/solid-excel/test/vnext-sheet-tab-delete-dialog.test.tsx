/** @jsxImportSource solid-js */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import {
  DEFAULT_SHEET_TABS_STATE,
  type SheetTabsState,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetSheetTabOverlays } from '../src-vnext/sheet-tabs/SpreadsheetSheetTabOverlays'

afterEach(cleanup)

const SHEETS: readonly SpreadsheetSheetMetadata[] = [
  { id: 'sheet-1', name: 'Sheet One', index: 0 },
  { id: 'sheet-2', name: 'Sheet Two', index: 1 },
]

async function flushOverlayEffects() {
  await Promise.resolve()
  await Promise.resolve()
}

function makeState(): SheetTabsState {
  return {
    ...DEFAULT_SHEET_TABS_STATE,
    phase: 'ready',
    capabilities: { list: true, add: true, rename: true, delete: true, reorder: true },
    deleteConfirmation: { sheetId: 'sheet-2', sheetName: 'Sheet Two' },
  }
}

function renderDeleteDialog(
  onCancel: () => void = () => undefined,
  onConfirm: () => void = () => undefined,
) {
  const [sheetTabs, setSheetTabs] = createSignal(makeState())
  const tabButton = jest.fn(() => document.querySelector('[data-testid="sheet-tab-anchor"]'))
  const controller = {
    cancelDelete: jest.fn(() => {
      onCancel()
      setSheetTabs((state) => ({ ...state, deleteConfirmation: null }))
    }),
    confirmDelete: jest.fn(onConfirm),
    tabButton,
  } as unknown as Parameters<typeof SpreadsheetSheetTabOverlays>[0]['controller']

  const view = render(() => (
    <>
      <button type="button" data-testid="sheet-tab-anchor">
        Sheet Two
      </button>
      <SpreadsheetSheetTabOverlays
        sheetTabs={sheetTabs}
        sheets={() => SHEETS}
        controller={controller}
      />
    </>
  ))

  return { ...view, controller, setSheetTabs }
}

describe('sheet-tab delete confirmation dialog', () => {
  it('uses the Office modal landmarks and danger action while retaining the sheet name', async () => {
    const { getByRole, getByTestId } = renderDeleteDialog()

    const dialog = getByRole('dialog', { name: 'Delete sheet “Sheet Two”?' })
    expect(dialog.getAttribute('aria-describedby')).toBe('sheet-tab-delete-description')
    expect(dialog.querySelector('header')).not.toBeNull()
    expect(dialog.querySelector('footer')).not.toBeNull()
    expect(getByTestId('sheet-tab-delete-confirm').getAttribute('data-variant')).toBe('danger')

    await flushOverlayEffects()
    expect(document.activeElement).toBe(getByTestId('sheet-tab-delete-cancel'))
  })

  it('closes on Escape and returns focus to the triggering sheet tab', async () => {
    const { getByTestId, controller } = renderDeleteDialog()
    await flushOverlayEffects()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushOverlayEffects()

    expect(controller.cancelDelete).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(getByTestId('sheet-tab-anchor'))
  })

  it('keeps confirmation delegated to the existing delete controller', () => {
    const { getByTestId, controller } = renderDeleteDialog()

    fireEvent.click(getByTestId('sheet-tab-delete-confirm'))

    expect(controller.confirmDelete).toHaveBeenCalledTimes(1)
  })

  it('keeps feature CSS token-only for light and dark themes', () => {
    const source = readFileSync(
      join(process.cwd(), 'excel/spreadsheet-ui-styles/features/sheet-tab-delete-dialog.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
    expect(source).toContain('var(--bg-surface)')
    expect(source).toContain('var(--error-text)')
    expect(source).toContain('var(--error-bg)')
  })
})
