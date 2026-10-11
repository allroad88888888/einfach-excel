import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { initializeWorkbookDocumentAtom, setRustWorkbookConnectionAtom, setViewportMetricsAtom,
  viewportMetricsAtom, beginProjectionAtom, resolveProjectionAtom,
  type NativeNamedRange, type RustWorkbookCommands, type RustWorkbookConnection } from '../src'

type ChangeInput = RustWorkbookCommands['namedRange.change']['payload']
export const names: readonly NativeNamedRange[] = [
  { name: 'SampleAmounts', target: { sheet: 1, range: [64, 2, 66, 2] } },
]

/** 目录只来自实际投影形状，不给旧 nameRegistryCacheAtom 填测试捷径。 */
export function setup(catalog: readonly NativeNamedRange[] = names) {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: ChangeInput) => ({
    changed: true,
    projection: { ...input.projection, cells: [], revision: 8, namedRanges: [
      ...names, { name: 'QuickUnits', target: { sheet: 0, range: [1, 4, 3, 4] } },
    ] },
  }))
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 'orders', index: 0, name: 'Sales Orders', rowCount: 1001, colCount: 26 },
    { id: 'summary', index: 1, name: 'Summary', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), sheetId: 'orders', rowCount: 1001, colCount: 26,
    rowHeight: 28, colWidth: 120, viewportHeight: 400, viewportWidth: 600,
  })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 'orders',
    reason: 'viewport', window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 } })
  if (read.status !== 'started' || read.request.kind !== 'visible-window')
    throw new Error('Expected a visible projection request')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 7, namedRanges: catalog } })
  return { store, request }
}
