import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  runVisibleProjectionAtom,
  setViewportMetricsAtom,
  workbookHighlightsAtom,
  type WorkbookBeforeChange,
} from '../../src'
import { setupRealWorkbookApi } from './wasm-runtime-fixture'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

async function boot(configureBeforeStart?: Parameters<typeof setupRealWorkbookApi>[0]) {
  const ctx = await setupRealWorkbookApi(configureBeforeStart)
  cleanups.push(ctx.dispose)
  return ctx
}

describe('createWorkbookApi: hooks({ beforeChange })', () => {
  test('synchronously intercepts, cancels, rejects async/throw/reentrant hooks, and preserves across reopen', async () => {
    const events: WorkbookBeforeChange[] = []
    let policy: (event: WorkbookBeforeChange) => unknown = () => true
    const { api } = await boot({
      configureBeforeStart: (hostApi) => {
        hostApi.hooks({
          beforeChange(event) {
            events.push(event)
            expect(Object.isFrozen(event)).toBe(true)
            expect(Object.isFrozen(event.payload)).toBe(true)
            return policy(event) as boolean | undefined
          },
        })
      },
    })

    const changes = vi.fn()
    cleanups.push(api.onChange(changes))

    // Read-only operations bypass beforeChange.
    expect((await api.read({ targets: [{ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }] })).status).toBe('ok')
    expect((await api.readDisplay({ sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } })).status).toBe('ok')
    expect(events).toHaveLength(0)

    // Returning false cancels before Worker execution without history or onChange.
    policy = () => false
    const cancelled = await api.write({
      cells: [{ sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 77 } } }],
    })
    expect(cancelled.status).toBe('error')
    if (cancelled.status === 'error') {
      expect(`${cancelled.error.code} ${cancelled.error.message}`).toContain('HOST_COMMAND_CANCELLED')
    }
    expect(changes).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ command: 'host.writeCells', source: 'api' })

    // Returning a Promise is rejected as non-synchronous.
    policy = () => Promise.resolve(true)
    const asyncRejected = await api.format({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      format: { bold: true },
    })
    expect(asyncRejected.status).toBe('error')
    if (asyncRejected.status === 'error') {
      expect(`${asyncRejected.error.code} ${asyncRejected.error.message}`).toContain(
        'HOST_HOOK_MUST_BE_SYNCHRONOUS',
      )
    }

    // Throwing inside beforeChange rejects the command.
    policy = () => {
      throw new Error('POLICY_VETO')
    }
    const thrown = await api.clear({
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      mode: 'all',
    })
    expect(thrown.status).toBe('error')
    if (thrown.status === 'error') expect(thrown.error.message).toContain('POLICY_VETO')

    // Reentrant persistent write inside beforeChange is rejected with HOST_HOOK_REENTRANT.
    let reentrantResult: Awaited<ReturnType<typeof api.write>> | undefined
    policy = () => {
      void api
        .write({
          cells: [{ sheetId: 'orders', row: 1, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 1 } } }],
        })
        .then((res) => {
          reentrantResult = res
        })
      return true
    }
    const outer = await api.write({
      cells: [{ sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 99 } } }],
    })
    expect(outer).toMatchObject({ status: 'ok', changed: true })
    await Promise.resolve()
    expect(reentrantResult?.status).toBe('error')
    if (reentrantResult?.status === 'error') {
      expect(`${reentrantResult.error.code} ${reentrantResult.error.message}`).toContain(
        'HOST_HOOK_REENTRANT',
      )
    }

    // Snapshot reopen on the same Store keeps hooks; another Store is isolated; hooks({}) removes.
    const snap = await api.exportSnapshot()
    expect(snap.status).toBe('ok')
    policy = () => false
    if (snap.status === 'ok') expect((await api.openSnapshot(snap.snapshot)).status).toBe('ok')
    const reopenedSheetId = api.getDocument().sheets[0]!.id
    expect(
      (
        await api.write({
          cells: [{ sheetId: reopenedSheetId, row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 5 } } }],
        })
      ).status,
    ).toBe('error')

    const { api: isolatedApi } = await boot()
    expect(
      (
        await isolatedApi.write({
          cells: [{ sheetId: 'orders', row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 5 } } }],
        })
      ).status,
    ).toBe('ok')

    api.hooks({})
    expect(
      (
        await api.write({
          cells: [{ sheetId: reopenedSheetId, row: 0, col: 0, input: { kind: 'literal', value: { kind: 'number', value: 5 } } }],
        })
      ).status,
    ).toBe('ok')
    expect(() => api.hooks({ beforeChange: 'bad' as unknown as () => boolean })).toThrow(
      'Invalid workbook hooks.',
    )
  })
})

describe('createWorkbookApi: highlight / clearHighlights / isCellVisible', () => {
  test('validates highlight bounds, colors, 128-id cap, clearHighlights and connection replacement', async () => {
    const { store, api } = await boot()
    const selectionBefore = api.getSelection()

    expect(
      api.highlight([
        { id: 'h1', sheetId: 'orders', range: { rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 3 } },
        {
          id: 'h2',
          sheetId: 'summary',
          range: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 },
          color: '#12ab34',
        },
      ]),
    ).toEqual({ status: 'ok' })
    expect(store.getter(workbookHighlightsAtom)).toEqual([
      { id: 'h1', sheetId: 'orders', range: { rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 3 }, color: '#6654c7' },
      { id: 'h2', sheetId: 'summary', range: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 }, color: '#12ab34' },
    ])
    expect(api.getSelection()).toEqual(selectionBefore)

    // Invalid inputs fail closed without replacing existing highlights.
    const tooMany = Array.from({ length: 129 }, (_, index) => ({
      id: `id-${index}`,
      sheetId: 'orders',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    }))
    expect(api.highlight(tooMany)).toMatchObject({ status: 'error', error: { message: expect.stringContaining('HOST_HIGHLIGHT_LIMIT') } })
    expect(
      api.highlight([
        { id: 'dup', sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } },
        { id: 'dup', sheetId: 'orders', range: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 } },
      ]),
    ).toMatchObject({ status: 'error' })
    expect(
      api.highlight([{ id: 'bad-color', sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, color: 'red' }]),
    ).toMatchObject({ status: 'error', error: { message: expect.stringContaining('INVALID_COLOR') } })
    expect(
      api.highlight([{ id: 'oob', sheetId: 'orders', range: { rowStart: 0, rowEnd: 500, colStart: 0, colEnd: 0 } }]),
    ).toMatchObject({ status: 'error', error: { message: expect.stringContaining('INVALID_RANGE') } })
    expect(store.getter(workbookHighlightsAtom)).toHaveLength(2)

    expect(api.clearHighlights()).toEqual({ status: 'ok' })
    expect(store.getter(workbookHighlightsAtom)).toEqual([])

    // Replacing the workbook clears highlights bound to the previous connection.
    api.highlight([{ id: 'temp', sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }])
    const snap = await api.exportSnapshot()
    if (snap.status === 'ok') await api.openSnapshot(snap.snapshot)
    expect(store.getter(workbookHighlightsAtom)).toEqual([])
  })

  test('isCellVisible checks pixel viewport, partial vs full edges, hidden rows, freeze occlusion and merges', async () => {
    const { store, api } = await boot()
    // 250px wide × 100px tall viewport; default row=24px, col=100px.
    // Visible cols at scrollLeft=0: col 0 (0..100 full), col 1 (100..200 full), col 2 (200..300 clipped at 250!).
    const baseMetrics = {
      sheetId: 'orders',
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 250,
      viewportHeight: 100,
      rowHeight: 24,
      colWidth: 100,
      rowCount: 200,
      colCount: 26,
      overscanRows: 2,
      overscanCols: 2,
    }
    store.setter(setViewportMetricsAtom, baseMetrics)
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'orders',
      window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 10 },
      viewport: { height: 100, width: 250, rowHeight: 24, colWidth: 100 },
      reason: 'viewport',
    })

    expect(api.isCellVisible(0, 0)).toBe(true)
    expect(api.isCellVisible(0, 0, 'orders', true)).toBe(true)
    expect(api.isCellVisible(0, 2, 'orders', false)).toBe(true)
    expect(api.isCellVisible(0, 2, 'orders', true)).toBe(false)
    // Overscan row 10 (y=240..264 > viewportHeight=100) and non-active sheet return false.
    expect(api.isCellVisible(10, 0)).toBe(false)
    expect(api.isCellVisible(0, 0, 'summary')).toBe(false)

    // Hidden row 1 is not visible.
    await api.visibility({
      sheetId: 'orders',
      range: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 },
      action: 'hide-rows',
    })
    expect(api.isCellVisible(1, 0)).toBe(false)

    // Freeze row 0 and scroll down by 24px: frozen row 0 stays visible, scrolled-under row 2 is occluded!
    await api.freeze({ sheetId: 'orders', rows: 1, cols: 0 })
    store.setter(setViewportMetricsAtom, { ...baseMetrics, scrollTop: 24 })
    expect(api.isCellVisible(0, 0)).toBe(true)
    expect(api.isCellVisible(2, 0)).toBe(false)

    // Merged cell B4:D4 (cols 1..3 = x 100..400 in 250px viewport): partially visible, NOT fully visible.
    store.setter(setViewportMetricsAtom, { ...baseMetrics, scrollTop: 0, viewportHeight: 120 })
    await api.merge({
      sheetId: 'orders',
      range: { rowStart: 3, rowEnd: 3, colStart: 1, colEnd: 3 },
      action: 'merge',
    })
    expect(api.isCellVisible(3, 1, 'orders', false)).toBe(true)
    expect(api.isCellVisible(3, 1, 'orders', true)).toBe(false)
  })
})
