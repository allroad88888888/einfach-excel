import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, type RustWorkbookConnection } from '../../src'
import { customFormulaPanelAtom, runCustomFormulaAtom,
  type CustomFormulaPanelAction } from '../../src/custom-formulas/expression-command'
import type { NativeCustomFormulaDefinition } from '../../src/custom-formulas/expression-types'
import type { RustCustomFormulaCommands } from '../../src/rust-workbook/custom-formulas/command'

export const DOUBLE: NativeCustomFormulaDefinition = { name: 'DOUBLE', parameters: ['AMOUNT'], expression: '=amount*2' }
export function setup(definitions: readonly NativeCustomFormulaDefinition[] = []) {
  const store = createStore()
  const request = vi.fn(async (command: string, input: unknown): Promise<unknown> => {
    if (command === 'customFormula.read') return { definitions, revision: 1 }
    const change = input as RustCustomFormulaCommands['customFormula.change']['payload']
    return { changed: true, definitions: change.action.kind === 'remove' ? [] : [DOUBLE],
      projection: { ...change.projection, cells: [], revision: 2 } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  const project = (revision = 1) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, {
      request: read.request,
      result: { ...read.request, cells: [], revision },
    })
  }
  project()
  return { store, connection, request, project,
    run: (action: CustomFormulaPanelAction) => store.setter(runCustomFormulaAtom, action),
    panel: () => store.getter(customFormulaPanelAtom) }
}
