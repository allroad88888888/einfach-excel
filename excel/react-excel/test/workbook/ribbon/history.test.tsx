import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { HistoryTools } from '../../../src/workbook/chrome/ribbon/HistoryTools'

async function setup(empty = false, failure = false, label = 'Edit cell') {
  const range = { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 }
  const entries = empty ? [] : [{ label, sheetIndex: 0, range }]
  let undoCount = entries.length
  const history = () => ({
    undoCount,
    redoCount: entries.length - undoCount,
    entries,
    notice: null,
  })
  const apply = vi.fn(async (input: RustWorkbookCommands['history.apply']['payload']) => {
    if (failure) throw new Error('Please retry')
    undoCount += input.direction === 'undo' ? -1 : 1
    return {
      projection: { ...input.projection, cells: [], revision: 1, history: history() },
      range,
      sheetId: 'orders',
      sizes: { rowHeights: [], colWidths: [] },
    }
  })
  const request = (async (command: string, payload: unknown) =>
    command === 'history.apply'
      ? apply(payload as RustWorkbookCommands['history.apply']['payload'])
      : {
          ...(payload as { request: VisibleProjectionRequest }).request,
          cells: [],
          history: history(),
        }) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 'orders', index: 0, name: 'Orders', rowCount: 100, colCount: 8 }],
  })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <HistoryTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'orders',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    })
  })
  return { apply }
}
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('history controls', () => {
  test.each(['Paste cells', 'Move cells'])(
    '%s uses native history commands, not another paste',
    async (label) => {
      const { apply } = await setup(false, false, label)
      await click('Recent operations')
      expect(screen.getByRole('listitem')).toHaveTextContent(label)
      await click('Close history')
      await click('Undo')
      await click('Redo')
      expect(apply.mock.calls.map(([input]) => input.direction)).toEqual(['undo', 'redo'])
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    },
  )
  test('empty history disables writes and displays an empty list', async () => {
    const { apply } = await setup(true)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    await click('Recent operations')
    expect(screen.getByRole('dialog')).toHaveTextContent('No recorded operations yet.')
    await click('Close history')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Recent operations' })).toHaveFocus()
    expect(apply).not.toHaveBeenCalled()
  })
  test('undo and redo render Rust counts and list entries', async () => {
    const { apply } = await setup()
    await click('Undo')
    expect(apply.mock.lastCall?.[0].direction).toBe('undo')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await click('Recent operations')
    expect(screen.getByRole('dialog')).toHaveTextContent('0 undo · 1 redo')
    expect(screen.getByRole('listitem')).toHaveTextContent('Orders · A2:A2 · Undone')
    await click('Close history')
    await click('Redo')
    expect(apply.mock.lastCall?.[0].direction).toBe('redo')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })
  test('an engine failure remains visible and permits retry', async () => {
    const { apply } = await setup(false, true)
    await click('Undo')
    expect(screen.getByRole('alert')).toHaveTextContent('Please retry')
    await click('Undo')
    expect(apply).toHaveBeenCalledTimes(2)
  })
})
