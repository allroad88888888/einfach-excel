import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import type { RustCustomFormulaCommands } from '../../../../spreadsheet-ui-core/src/rust-workbook/custom-formulas/command'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { CustomFormulaTools } from '../../../src/workbook/custom-formulas/CustomFormulaTools'

const DOUBLE = { name: 'DOUBLE', parameters: ['AMOUNT'], expression: '=amount*2' }
function setup(existing = false) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  const read = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, {
    request: read.request,
    result: { ...read.request, cells: [], revision: 1 },
  })
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'customFormula.read')
      return { definitions: existing ? [DOUBLE] : [], revision: 1 }
    const input = payload as RustCustomFormulaCommands['customFormula.change']['payload']
    return {
      changed: true,
      definitions: input.action.kind === 'remove' ? [] : [DOUBLE],
      projection: { ...input.projection, cells: [], revision: 2 },
    }
  })
  render(
    <WorkbookStoreProvider
      store={store}
      connection={{
        request: request as RustWorkbookConnection['request'],
        dispose() {},
      }}
    >
      <CustomFormulaTools />
    </WorkbookStoreProvider>,
  )
  return request
}
async function click(name: string) {
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: exactName }))
  })
}
async function change(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  })
}

test('native empty directory focuses name; registration dispatches expression without touching cells', async () => {
  const request = setup()
  await click('Custom formulas')
  expect(screen.getByText('No custom formulas yet.')).toBeVisible()
  expect(screen.getByLabelText('Function name')).toHaveFocus()
  await change('Function name', 'DOUBLE'); await change('Parameters, separated by commas', 'amount')
  await change('Formula expression', '=amount*2'); await click('Register formula')
  expect(request.mock.calls[1]).toMatchObject(['customFormula.change', {
    action: { kind: 'upsert', definition: { name: 'DOUBLE', parameters: ['amount'], expression: '=amount*2' } },
  }])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Custom formulas' })).toHaveFocus()
})

test('saved native definition populates fields; replace and remove are separate actions', async () => {
  const request = setup(true)
  await click('Custom formulas'); await change('Saved formula', 'DOUBLE')
  expect(screen.getByLabelText('Function name')).toHaveAttribute('readonly')
  expect(screen.getByLabelText('Formula expression')).toHaveValue('=amount*2')
  await change('Formula expression', '=amount*3'); await click('Replace formula')
  expect(request.mock.calls[1]).toMatchObject(['customFormula.change', {
    action: { kind: 'upsert', definition: { name: 'DOUBLE', expression: '=amount*3' } },
  }])
})

test('remove ignores invalid editor draft and native failure preserves editable input', async () => {
  const request = setup(true)
  await click('Custom formulas'); await change('Saved formula', 'DOUBLE')
  await change('Formula expression', '')
  request.mockRejectedValueOnce(new Error('Native custom formula failed.'))
  await click('Remove formula')
  expect(screen.getByRole('alert')).toHaveTextContent('Native custom formula failed.')
  expect(screen.getByLabelText('Formula expression')).toHaveValue('')
  await click('Remove formula')
  expect(request.mock.calls[2]).toMatchObject(['customFormula.change', { action: { kind: 'remove', name: 'DOUBLE' } }])
})

test('Cancel and Escape discard editor state and restore trigger focus', async () => {
  const request = setup()
  await click('Custom formulas'); await change('Function name', 'discard'); await click('Cancel')
  expect(screen.getByRole('button', { name: 'Custom formulas' })).toHaveFocus()
  await click('Custom formulas')
  expect(screen.getByLabelText('Function name')).toHaveValue('')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(request).toHaveBeenCalledTimes(2)
})

test('deferred native read renders busy and cancels; deferred saving blocks duplicate and Escape', async () => {
  const request = setup()
  let finish!: (reply: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Custom formulas')
  expect(screen.getByRole('status')).toHaveTextContent('Loading custom formulas')
  expect(screen.getByLabelText('Function name')).toBeDisabled()
  await click('Cancel')
  await act(async () => { finish({ definitions: [DOUBLE], revision: 1 }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Custom formulas'); await change('Function name', 'DOUBLE'); await change('Formula expression', '=1')
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Register formula')
  expect(screen.getByRole('status')).toHaveTextContent('Saving custom formula')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Register formula' })).toBeDisabled()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.getByRole('dialog')).toBeVisible()
  const input = request.mock.calls[2][1] as RustCustomFormulaCommands['customFormula.change']['payload']
  await act(async () => {
 finish({ changed: true, definitions: [DOUBLE],
    projection: { ...input.projection, cells: [], revision: 2 } })
})
  expect(screen.queryByRole('dialog')).toBeNull()
})
