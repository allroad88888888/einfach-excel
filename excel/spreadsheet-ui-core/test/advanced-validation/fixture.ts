import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom } from '../../src/projection'
import { initializeWorkbookDocumentAtom } from '../../src/runtime/workbook-document'
import { setRustWorkbookConnectionAtom } from '../../src/runtime/workbook-connection'
import { setSelectionAtom } from '../../src/selection'
import { nativeDataValidationPanelAtom, runNativeDataValidationAtom } from '../../src/data-validation/native-panel'
import type { NativeDataValidationRule } from '../../src/data-validation/native-rule'
import type { RustWorkbookConnection } from '../../src/rust-workbook/commands'

export function fixture(rule: NativeDataValidationRule | null = null) {
  const store = createStore()
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'validation.read') return rule
    const input = payload as {
      projection: object
      request?: { sheetId: string; requestId: number }
    }
    return {
      projection: { ...input.projection, cells: [], revision: 2 },
      ...(input.request
        ? {
            acknowledgement: {
              sheetId: input.request.sheetId,
              requestId: input.request.requestId,
              revision: 2,
            },
          }
        : {}),
    }
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 }],
  })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  })
  store.setter(setSelectionAtom, {
    sheetId: 's',
    kind: 'range',
    anchor: { row: 1, col: 1 },
    focus: { row: 2, col: 1 },
  })
  const project = (revision = 1) => {
    const read = store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId: 's',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 },
      reason: 'viewport',
    })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, {
      request: read.request,
      result: { ...read.request, cells: [], revision },
    })
  }
  project()
  const run = (input: Parameters<typeof runNativeDataValidationAtom.write>[2]) =>
    store.setter(runNativeDataValidationAtom, input)
  return { store, request, run, project, panel: () => store.getter(nativeDataValidationPanelAtom) }
}
