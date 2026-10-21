import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setSelectionAtom, setRustWorkbookConnectionAtom, projectionSnapshotAtom,
  getSheetProtection, sheetProtectionAtom, type RustWorkbookConnection } from '../../src'
import { nativeProtectionPanelAtom, runNativeProtectionAtom } from '../../src/protection/native/panel'
import type { SheetProtectionState } from '../../src/protection/types'
import type { RustProtectionCommands } from '../../src/rust-workbook/protection/commands'

function setup() {
  const store = createStore()
  let protection: SheetProtectionState = { mode: 'open', unlockedRanges: [] }
  let revision = 1
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'protection.read') return protection
    const input = payload as RustProtectionCommands['protection.change']['payload']
    const change = input.change
    protection =
      change.action === 'protect'
        ? { ...protection, mode: 'protected' }
        : change.action === 'unprotect'
          ? { ...protection, mode: 'open' }
          : change.action === 'allow-range'
            ? { ...protection, unlockedRanges: [...protection.unlockedRanges, change.range] }
            : {
                ...protection,
                unlockedRanges: protection.unlockedRanges.filter((_, i) => i !== change.index),
              }
    return { changed: true, protection,
      projection: { ...input.projection, cells: [], revision: ++revision } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
  const project = (rev = 1) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], revision: rev } })
  }
  project()
  const run = (action: Parameters<typeof runNativeProtectionAtom.write>[2]) =>
    store.setter(runNativeProtectionAtom, action)
  return { store, request, run, project }
}

test('native settings responses alone publish protection; range selection is captured on opening', async () => {
  const { store, request, run } = setup()
  expect(await run('open')).toBe(true)
  expect(request).toHaveBeenCalledExactlyOnceWith('protection.read', { sheetId: 's' })
  expect(store.getter(nativeProtectionPanelAtom).selectionAddress).toBe('B2:C3')
  await run('allow-selection')
  expect(request.mock.calls[1]).toMatchObject(['protection.change', {
    revision: 1, change: { action: 'allow-range', range: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 } },
  }])
  await run('protect')
  expect(getSheetProtection(store.getter(sheetProtectionAtom), 's').mode).toBe('protected')
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(3)
  await run('unprotect'); await run({ remove: 0 })
  expect(store.getter(nativeProtectionPanelAtom).protection?.unlockedRanges).toEqual([])
})

test('cancel read ignores late replies without publishing old settings into a new workbook', async () => {
  const { store, request, run } = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = run('open')
  expect(store.getter(nativeProtectionPanelAtom).busy).toBe(true)
  expect(await run('close')).toBe(true)
  finish({ mode: 'protected', unlockedRanges: [] })
  expect(await pending).toBe(false)
  expect(store.getter(nativeProtectionPanelAtom).open).toBe(false)
  expect(getSheetProtection(store.getter(sheetProtectionAtom), 's').mode).toBe('open')
})

test('pending writes prevent duplicate changes and retain a retryable native error', async () => {
  const { store, request, run } = setup()
  await run('open')
  let reject!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
  const pending = run('protect')
  expect(store.getter(nativeProtectionPanelAtom).busy).toBe(true)
  expect(await run('protect')).toBe(false)
  expect(await run('close')).toBe(false)
  reject(new Error('Native protection failed.'))
  expect(await pending).toBe(false)
  expect(store.getter(nativeProtectionPanelAtom)).toMatchObject({ phase: 'ready', busy: false,
    error: 'Native protection failed.', protection: { mode: 'open' } })
  expect(await run('protect')).toBe(true)
})

test('changed revision and mismatched native acknowledgement cannot replace the current projection', async () => {
  const { store, request, run, project } = setup()
  await run('open'); project(5)
  expect(await run('protect')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  await run('close'); project(); await run('open')
  request.mockImplementationOnce(async (_command, payload) => {
    const input = payload as RustProtectionCommands['protection.change']['payload']
    return { changed: true, protection: { mode: 'protected', unlockedRanges: [] },
      projection: { ...input.projection, cells: [], revision: 99 } }
  })
  expect(await run('protect')).toBe(false)
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
  expect(store.getter(nativeProtectionPanelAtom).error).toContain('mismatched')
})

test('replacing a workbook during a native write hides the old panel and rejects the late result', async () => {
  const { store, request, run } = setup()
  await run('open')
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = run('protect')
  store.setter(setRustWorkbookConnectionAtom, { request: vi.fn() as RustWorkbookConnection['request'], dispose() {} })
  const input = request.mock.calls[1][1] as RustProtectionCommands['protection.change']['payload']
  finish({ changed: true, protection: { mode: 'protected', unlockedRanges: [] },
    projection: { ...input.projection, cells: [], revision: 2 } })
  expect(await pending).toBe(false)
  expect(store.getter(nativeProtectionPanelAtom)).toMatchObject({ open: false, busy: false })
})
