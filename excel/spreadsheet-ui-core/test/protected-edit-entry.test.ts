import { expect, test } from 'vitest'
import {
  createSpreadsheetUi, editingSessionAtom, runVisibleProjectionAtom,
  setSheetProtectionAtom, startCellEditingFromProjectionAtom, readOnlySheetIdsAtom,
  type EditingInputSource, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const connection = createTestRustWorkbookConnection({
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return { ...request, cells: [],
        mergedRanges: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }] }
    },
  })
  const core = createSpreadsheetUi({ connection })
  await core.store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    reason: 'viewport',
  })
  core.store.setter(setSheetProtectionAtom, {
    sheetId: 'sheet-1', state: { mode: 'protected', unlockedRanges: [] },
  })
  return core.store
}

test.each<EditingInputSource>(['cell', 'keyboard', 'formula-bar', 'paste'])(
  'locked %s entry never creates a draft', async source => {
    const store = await setup()
    expect(store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1', cell: { row: 1, col: 1 }, source, initialDraft: '9',
    })).toBe(false)
    expect(store.getter(editingSessionAtom).source).toBeNull()
  },
)

test('merged editing checks the canonical anchor, not the unlocked covered cell', async () => {
  const store = await setup()
  store.setter(setSheetProtectionAtom, {
    sheetId: 'sheet-1', state: { mode: 'protected', unlockedRanges: [
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
    ] },
  })
  expect(store.setter(startCellEditingFromProjectionAtom, {
    sheetId: 'sheet-1', cell: { row: 0, col: 1 },
  })).toBe(false)
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test.each(['open', 'protected'] as const)('allows an editable cell in %s mode', async mode => {
  const store = await setup()
  expect(store.getter(readOnlySheetIdsAtom).has('sheet-1')).toBe(true)
  store.setter(setSheetProtectionAtom, {
    sheetId: 'sheet-1', state: { mode, unlockedRanges: [
      { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
    ] },
  })
  expect(store.getter(readOnlySheetIdsAtom).has('sheet-1')).toBe(false)
  expect(store.setter(startCellEditingFromProjectionAtom, {
    sheetId: 'sheet-1', cell: { row: 1, col: 1 }, initialDraft: '9',
  })).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('9')
})
