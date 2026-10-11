import { expect, test } from 'vitest'
import { names, setup } from './native-name-test-fixture'
import {
  activeWorkbookSheetAtom, commitNameBoxAtom, focusNameBoxAtom,
  goToErrorMessageAtom, goToHistoryAtom, goToOpenAtom,
  nativeNamedRangesAtom,
  runGoToReferenceAtom, selectionSnapshotAtom,
  setSelectionAtom, viewportMetricsAtom,
} from '../src'

test('name box resolves the native catalog case-insensitively and switches to its target sheet', async () => {
  const { store, request } = setup()
  const sessionId = store.setter(focusNameBoxAtom)
  const target = await store.setter(commitNameBoxAtom, { input: 'sampleamounts', sessionId })
  expect(target).toMatchObject({ kind: 'named-range', name: 'SampleAmounts', sheetId: 'summary' })
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2,
  })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({
    sheetId: 'summary', rowCount: 100, colCount: 8,
  })
  expect(request).not.toHaveBeenCalled()
})

test('name box creates the selected range with one native command and publishes its returned catalog', async () => {
  const { store, request } = setup()
  store.setter(setSelectionAtom, { sheetId: 'orders', kind: 'range',
    anchor: { row: 1, col: 4 }, focus: { row: 3, col: 4 } })
  const sessionId = store.setter(focusNameBoxAtom)
  await store.setter(commitNameBoxAtom, { input: 'QuickUnits', sessionId })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['namedRange.change', {
    sheetId: 'orders', revision: 7,
    action: { kind: 'create', name: 'QuickUnits', target: {
      sheetId: 'orders', range: { rowStart: 1, rowEnd: 3, colStart: 4, colEnd: 4 },
    } },
  }])
  expect(store.getter(nativeNamedRangesAtom)).toContainEqual({
    name: 'QuickUnits', target: { sheet: 0, range: [1, 4, 3, 4] },
  })
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 1, rowEnd: 3, colStart: 4, colEnd: 4,
  })
})

test('Go To resolves native names without writing and records an absolute cross-sheet location', () => {
  const { store, request } = setup()
  store.setter(runGoToReferenceAtom, 'open')
  store.setter(runGoToReferenceAtom, { input: 'sampleamounts' })
  expect(store.setter(runGoToReferenceAtom, 'submit')).toBe(true)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2,
  })
  expect(store.getter(goToHistoryAtom)[0]).toBe("'Summary'!C65:C67")
  expect(store.getter(goToOpenAtom)).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test.each(['Sales1', 'Sales.', 'Sales..Quarter', 'XFE1', 'A1048577', '销售额'])(
  'Go To resolves the Rust-accepted name %s without duplicating name syntax rules', (name) => {
    const { store, request } = setup([{ ...names[0], name }])
    store.setter(runGoToReferenceAtom, 'open')
    store.setter(runGoToReferenceAtom, { input: name.toLowerCase() })
    expect(store.setter(runGoToReferenceAtom, 'submit')).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
    // 定位沿用现有范围 anchor/focus 约定，不在名称入口另改活动格规则。
    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2,
    })
    expect(request).not.toHaveBeenCalled()
  },
)

test.each([
  null, { sheet: 99, range: [0, 0, 1, 0] }, { sheet: 1, range: [99, 0, 100, 0] },
] as const)(
  'Go To rejects unavailable native targets without changing the view (%j)', (target) => {
    const { store, request } = setup([{ name: 'Broken', target }])
    const before = store.getter(selectionSnapshotAtom)
    const scroll = store.getter(viewportMetricsAtom)
    store.setter(runGoToReferenceAtom, 'open')
    store.setter(runGoToReferenceAtom, { input: 'Broken' })
    expect(store.setter(runGoToReferenceAtom, 'submit')).toBe(false)
    expect(store.getter(goToErrorMessageAtom)).toContain('named range')
    expect(store.getter(goToOpenAtom)).toBe(true)
    expect(store.getter(selectionSnapshotAtom)).toEqual(before)
    expect(store.getter(viewportMetricsAtom)).toEqual(scroll)
    expect(store.getter(goToHistoryAtom)).toEqual([])
    expect(request).not.toHaveBeenCalled()
  },
)
