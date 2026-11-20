import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createWorkbookApi,
  projectionSnapshotAtom,
  setCalculationModeAtom,
  startEditingAtom,
  workbookDrawingSuspendedAtom,
} from '../../src'
import { createStore } from '@einfach/core'
import { setupRealWorkbookApi } from './wasm-runtime-fixture'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

async function boot() {
  const ctx = await setupRealWorkbookApi()
  cleanups.push(ctx.dispose)
  return ctx
}

describe('createWorkbookApi: nested suspendDraw / resumeDraw / refresh', () => {
  test('nested suspendDraw increments depth and only final resumeDraw refreshes document and projection', async () => {
    const { store, api } = await boot()
    const events: string[] = []
    const stop = api.onChange((event) => {
      if (event) events.push(event.kind)
    })
    cleanups.push(stop)

    const initialProjection = store.getter(projectionSnapshotAtom).result
    const p1 = api.suspendDraw()
    const p2 = api.suspendDraw()
    expect(p1).toEqual({ status: 'ok', depth: 1 })
    expect(p2).toEqual({ status: 'ok', depth: 2 })
    expect(store.getter(workbookDrawingSuspendedAtom)).toBe(true)

    // Writes still commit in Rust and emit onChange while UI drawing is suspended.
    const writeRes = await api.write({
      cells: [{ sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 42 } } }],
    })
    expect(writeRes).toMatchObject({ status: 'ok', changed: true })
    const addRes = await api.addSheet({ name: 'Archive' })
    expect(addRes.status).toBe('ok')
    expect(events).toEqual(['host.writeCells', 'host.sheet-add'])

    // Native read & readDisplay reflect latest Rust facts without replacing retained UI state.
    const rawRead = await api.read({
      targets: [{ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }],
    })
    expect(rawRead.status === 'ok' && rawRead.ranges[0]?.cells[0]?.value).toEqual({
      kind: 'number',
      value: 42,
    })
    const displayRead = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
    expect(displayRead.status === 'ok' && displayRead.snapshot.cells[0]?.displayValue).toBe('42')

    // Document directory & visible projection remain held at pre-suspension snapshot; refresh defers.
    expect(api.getDocument().sheets.map((s) => s.name)).toEqual(['Orders', 'Summary'])
    expect(store.getter(projectionSnapshotAtom).result).toBe(initialProjection)
    expect(await api.refresh()).toEqual({ status: 'ok', deferred: true })

    // Outer resume decrements depth to 1 without releasing suspension.
    expect(await api.resumeDraw()).toEqual({ status: 'ok', depth: 1 })
    expect(store.getter(workbookDrawingSuspendedAtom)).toBe(true)
    expect(api.getDocument().sheets.map((s) => s.name)).toEqual(['Orders', 'Summary'])

    // Final resume releases suspension and publishes updated sheet directory & visible projection.
    expect(await api.resumeDraw()).toEqual({ status: 'ok', depth: 0 })
    expect(store.getter(workbookDrawingSuspendedAtom)).toBe(false)
    expect(api.getDocument().sheets.map((s) => s.name)).toEqual(['Orders', 'Summary', 'Archive'])
    const updatedProjection = store.getter(projectionSnapshotAtom).result
    expect(updatedProjection?.kind === 'visible-window' && updatedProjection.cells[0]?.displayValue).toBe('42')

    // Extra resume when already unsuspended is an idempotent depth-0 no-op; explicit refresh runs immediately.
    expect(await api.resumeDraw()).toEqual({ status: 'ok', depth: 0 })
    expect(await api.refresh()).toEqual({ status: 'ok', deferred: false })
  })

  test('suspendDraw rejects before workbook is ready or while cell editing is active', async () => {
    const unreadyApi = createWorkbookApi(createStore())
    expect(unreadyApi.suspendDraw()).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('WORKBOOK_NOT_READY') },
    })

    const { store, api } = await boot()
    store.setter(startEditingAtom, {
      sheetId: 'orders',
      cell: { row: 0, col: 0 },
      source: 'cell',
      draft: '123',
    })
    expect(api.suspendDraw()).toMatchObject({
      status: 'error',
      error: { code: 'HOST_EDITING_ACTIVE' },
    })
  })
})

describe('createWorkbookApi: nested suspendCalculation / resumeCalculation / recalculate', () => {
  test('nested calculation suspension holds stale formula values until final resume in automatic mode', async () => {
    const { api } = await boot()
    await api.write({
      cells: [
        { sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 10 } } },
        { sheetId: 'orders', row: 0, col: 1, input: { kind: 'formula', formula: '=A1*3' } },
      ],
    })
    const initial = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
    })
    expect(initial.status === 'ok' && initial.snapshot.cells[0]?.displayValue).toBe('30')

    const s1 = await api.suspendCalculation()
    const s2 = await api.suspendCalculation()
    expect(s1).toMatchObject({ status: 'ok', depth: 1 })
    expect(s2).toMatchObject({ status: 'ok', depth: 2 })

    // Explicit recalculate is rejected with CALCULATION_SUSPENDED while paused.
    const blockedRecalc = await api.recalculate()
    expect(blockedRecalc.status).toBe('error')
    if (blockedRecalc.status === 'error') {
      expect(`${blockedRecalc.error.code} ${blockedRecalc.error.message}`).toContain(
        'CALCULATION_SUSPENDED',
      )
    }

    // Updating A1 and adding a new formula C1 while suspended leaves B1 at 30 and C1 unevaluated.
    await api.write({
      cells: [
        { sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 25 } } },
        { sheetId: 'orders', row: 0, col: 2, input: { kind: 'formula', formula: '=A1+5' } },
      ],
    })
    const whilePaused = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 },
    })
    expect(whilePaused.status === 'ok' && whilePaused.snapshot.cells[0]?.displayValue).toBe('30')

    // First resume drops depth to 1; formulas remain deferred.
    const r1 = await api.resumeCalculation()
    expect(r1).toMatchObject({ status: 'ok', depth: 1 })
    const stillPaused = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
    })
    expect(stillPaused.status === 'ok' && stillPaused.snapshot.cells[0]?.displayValue).toBe('30')

    // Final resume drops depth to 0, restores automatic mode and evaluates dirty formulas.
    const r2 = await api.resumeCalculation()
    expect(r2).toMatchObject({ status: 'ok', depth: 0, mode: 'automatic' })
    const afterResume = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 },
    })
    expect(afterResume.status === 'ok' && afterResume.snapshot.cells.map((c) => c.displayValue)).toEqual([
      '75',
      '30',
    ])
  })

  test('manual calculation mode stays manual after resumeCalculation until explicit recalculate', async () => {
    const { store, api } = await boot()
    await api.write({
      cells: [
        { sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 4 } } },
        { sheetId: 'orders', row: 0, col: 1, input: { kind: 'formula', formula: '=A1*10' } },
      ],
    })
    expect(await store.setter(setCalculationModeAtom, 'manual')).toBe(true)

    await api.suspendCalculation()
    await api.write({
      cells: [{ sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 9 } } }],
    })
    const resumed = await api.resumeCalculation()
    expect(resumed).toMatchObject({ status: 'ok', depth: 0, mode: 'manual' })

    const beforeRecalc = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
    })
    expect(beforeRecalc.status === 'ok' && beforeRecalc.snapshot.cells[0]?.displayValue).toBe('40')

    expect(await api.recalculate('orders')).toMatchObject({ status: 'ok', depth: 0, mode: 'manual' })
    const afterRecalc = await api.readDisplay({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
    })
    expect(afterRecalc.status === 'ok' && afterRecalc.snapshot.cells[0]?.displayValue).toBe('90')
    expect(vi.isMockFunction(api.recalculate)).toBe(false)
  })
})
