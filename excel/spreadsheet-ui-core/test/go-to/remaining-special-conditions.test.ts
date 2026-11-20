import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  beginProjectionAtom,
  goToSpecialPanelAtom,
  initializeWorkbookDocumentAtom,
  openGoToAtom,
  resolveProjectionAtom,
  runGoToSpecialAtom,
  runGoToSpecialScan,
  runGoToSpecialScanAtom,
  selectedDrawingAtom,
  selectionSnapshotAtom,
  setGoToLocatorAtom,
  setGoToModeAtom,
  setRustWorkbookConnectionAtom,
  setSelectionAtom,
  type RustWorkbookConnection,
  type SheetDrawing,
} from '../../src'
import { DEFAULT_HOST_CONTROLS, validateHostControls } from '../../src/host/policy'

test('pure runGoToSpecialScan handles same-rule matching and direct vs all-levels formula tracing', () => {
  const cells = [
    { row: 0, col: 0, displayValue: '10', valueKind: 'number' as const, conditionalFormat: { id: 'cf1' }, validation: { kind: 'whole', min: 1, max: 10 } },
    { row: 0, col: 1, displayValue: '20', valueKind: 'number' as const, formula: '=A1*2', conditionalFormat: { id: 'cf1' }, validation: { kind: 'whole', min: 1, max: 10 } },
    { row: 0, col: 2, displayValue: '25', valueKind: 'number' as const, formula: '=B1+5', conditionalFormat: { id: 'cf2' }, validation: { kind: 'list', items: ['x'] } },
    { row: 0, col: 3, displayValue: '24', valueKind: 'number' as const, formula: '=C1-1' },
  ]

  const cfSame = runGoToSpecialScan(
    { kind: 'conditional-format-same' },
    { sheetId: 's1', activeCell: { row: 0, col: 0 }, cells },
  )
  expect(cfSame.totalMatchCount).toBe(2)
  expect(cfSame.regions[0]).toMatchObject({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 1 } })

  const dvSame = runGoToSpecialScan(
    { kind: 'data-validation-same' },
    { sheetId: 's1', activeCell: { row: 0, col: 0 }, cells },
  )
  expect(dvSame.totalMatchCount).toBe(2)

  const directPrec = runGoToSpecialScan(
    { kind: 'precedents' },
    { sheetId: 's1', activeCell: { row: 0, col: 3 }, cells },
  )
  expect(directPrec.totalMatchCount).toBe(1)
  expect(directPrec.regions[0]).toMatchObject({
    anchor: { row: 0, col: 2 },
    focus: { row: 0, col: 2 },
  })

  const allPrec = runGoToSpecialScan(
    { kind: 'precedents-all' },
    { sheetId: 's1', activeCell: { row: 0, col: 3 }, cells },
  )
  expect(allPrec.totalMatchCount).toBe(3)
  expect(allPrec.regions[0]).toMatchObject({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 2 },
  })

  const directDep = runGoToSpecialScan(
    { kind: 'dependents' },
    { sheetId: 's1', activeCell: { row: 0, col: 0 }, cells },
  )
  expect(directDep.totalMatchCount).toBe(1)
  expect(directDep.regions[0]).toMatchObject({
    anchor: { row: 0, col: 1 },
    focus: { row: 0, col: 1 },
  })

  const allDep = runGoToSpecialScan(
    { kind: 'dependents-all' },
    { sheetId: 's1', activeCell: { row: 0, col: 0 }, cells },
  )
  expect(allDep.totalMatchCount).toBe(3)
  expect(allDep.regions[0]).toMatchObject({
    anchor: { row: 0, col: 1 },
    focus: { row: 0, col: 3 },
  })
})

test('objects locator selects the first floating object when present and preserves selection when empty', async () => {
  const drawings: SheetDrawing[] = []
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's1', index: 0, name: 'Sheet1', rowCount: 50, colCount: 10 }],
  })
  const request = vi.fn(async (cmd: string) => {
    if (cmd === 'drawings.read') return { drawings: [...drawings], revision: 1 }
    throw new Error(`unexpected ${cmd}`)
  })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  })
  store.setter(setSelectionAtom, {
    sheetId: 's1',
    kind: 'range',
    anchor: { row: 2, col: 3 },
    focus: { row: 2, col: 3 },
  })
  const read = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  if (read.status === 'started' && read.request.kind === 'visible-window') {
    store.setter(resolveProjectionAtom, {
      request: read.request,
      result: { ...read.request, revision: 1, cells: [] },
    })
  }

  expect(await store.setter(runGoToSpecialAtom, 'open')).toBe(true)
  expect(await store.setter(runGoToSpecialAtom, 'objects')).toBe(false)
  expect(store.getter(goToSpecialPanelAtom).open).toBe(true)
  expect(store.getter(goToSpecialPanelAtom).error).toContain('No floating objects')
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 2, col: 3 })

  drawings.push(
    { id: 'chart-1', kind: 'chart', anchor: { row: 5, col: 1, offsetX: 0, offsetY: 0, width: 320, height: 200 }, refs: [], payload: {} },
    { id: 'img-2', kind: 'image', anchor: { row: 8, col: 2, offsetX: 0, offsetY: 0, width: 120, height: 80 }, refs: [], payload: {} },
  )
  // Advance projection revision so drawings cache refreshes
  const read2 = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  if (read2.status === 'started' && read2.request.kind === 'visible-window') {
    store.setter(resolveProjectionAtom, {
      request: read2.request,
      result: { ...read2.request, revision: 2, cells: [] },
    })
  }

  expect(await store.setter(runGoToSpecialAtom, 'objects')).toBe(true)
  expect(store.getter(goToSpecialPanelAtom).open).toBe(false)
  expect(store.getter(selectedDrawingAtom)?.id).toBe('chart-1')
  expect(store.getter(goToSpecialPanelAtom).notice).toBe('Selected 1 of 2 floating objects.')

  // Session scan command path also supports objects
  store.setter(openGoToAtom)
  store.setter(setGoToModeAtom, 'special')
  store.setter(setGoToLocatorAtom, { kind: 'objects' })
  await store.setter(runGoToSpecialScanAtom, {
    port: { readRangeProjection: async (req) => ({ kind: 'range', sheetId: req.sheetId, range: req.range, requestId: req.requestId, cells: [] }) },
  })
  expect(store.getter(selectedDrawingAtom)?.id).toBe('chart-1')
})

test('validateHostControls accepts optional YMD/MDY/DMY dateInputOrder and rejects unknown values', () => {
  expect(validateHostControls(DEFAULT_HOST_CONTROLS)).toEqual({
    readOnly: false,
    busy: false,
    allowSheetStructure: true,
  })
  expect(validateHostControls({ ...DEFAULT_HOST_CONTROLS, dateInputOrder: 'DMY' })).toEqual({
    readOnly: false,
    busy: false,
    allowSheetStructure: true,
    dateInputOrder: 'DMY',
  })
  expect(() =>
    validateHostControls({
      ...DEFAULT_HOST_CONTROLS,
      dateInputOrder: 'INVALID' as unknown as 'YMD',
    }),
  ).toThrow('Invalid host controls.')
})
