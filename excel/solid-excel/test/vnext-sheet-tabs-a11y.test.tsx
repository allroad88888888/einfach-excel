/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { createStore } from '@einfach/core'
import type { SpreadsheetBackend, SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

import { SpreadsheetSheetTabs } from '../src/sheet-tabs'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

const sheets: SpreadsheetSheetMetadata[] = [
  { id: 'sheet-1', name: 'Sheet One', index: 0 },
  { id: 'sheet-2', name: 'Sheet Two', index: 1 },
]

const backend: SpreadsheetBackend = {
  async listSheets() {
    return { revision: 0, sheets }
  },
  async renameSheet(request) {
    return {
      requestId: request.requestId,
      sheetId: request.sheetId,
      activeSheetId: request.sheetId,
      revision: 1,
      sheets: sheets.map((sheet) =>
        sheet.id === request.sheetId ? { ...sheet, name: request.name } : sheet,
      ),
    }
  },
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

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function renderSheetTabs() {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={createStore()}>
      <SpreadsheetSheetTabs sheets={sheets} />
    </SpreadsheetUiProvider>
  ))
}

describe('vNext SpreadsheetSheetTabs accessibility structure', () => {
  it('keeps tablist ownership exclusive to tabs and names adjacent sheet actions', async () => {
    const { getByRole, getByTestId } = renderSheetTabs()
    await flushAsyncWork()

    const tablist = getByRole('tablist', { name: 'Workbook sheets' })
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(tablist.querySelector('[data-testid^="sheet-tab-reorder-"]')).toBeNull()
    expect(tablist.querySelector('[data-testid="sheet-tab-add"]')).toBeNull()

    const actions = getByRole('group', { name: 'Sheet actions' })
    // 重排把手已删除(拖页签本体即重排),动作簇只剩"新建 sheet"。
    expect(document.querySelector('[data-testid^="sheet-tab-reorder-"]')).toBeNull()
    expect(actions.contains(getByTestId('sheet-tab-add'))).toBe(true)
  })

  it('keeps the rename editor outside tablist while preserving F2 and Escape focus flow', async () => {
    const { getByRole } = renderSheetTabs()
    await flushAsyncWork()

    const tablist = getByRole('tablist', { name: 'Workbook sheets' })
    const tab = getByRole('tab', { name: 'Sheet One' })
    tab.focus()
    fireEvent.keyDown(tab, { key: 'F2' })
    await flushAsyncWork()

    const editor = getByRole('textbox', { name: 'Rename Sheet One' })
    expect(tablist.contains(editor)).toBe(false)
    expect(document.activeElement).toBe(editor)

    fireEvent.keyDown(editor, { key: 'Escape' })
    await flushAsyncWork()
    expect(document.activeElement).toBe(tab)
  })
})
