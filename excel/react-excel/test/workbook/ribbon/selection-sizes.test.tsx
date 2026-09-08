import { createStore } from '@einfach/core'
import {
  runVisibleProjectionAtom,
  selectCellAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { SelectionSizeTools } from '../../../src/workbook/chrome/ribbon/SelectionSizeTools'

async function setup(failure = false) {
  const resize = vi.fn(async (input: RustWorkbookCommands['range.resize']['payload']) => {
    if (failure) throw new Error('Try again')
    return {
      projection: { ...input.projection, cells: [], revision: 1 },
      sizes: { rowHeights: [], colWidths: [] },
    }
  })
  const request = (async (command: string, payload: unknown) =>
    command === 'range.resize'
      ? resize(payload as RustWorkbookCommands['range.resize']['payload'])
      : {
          ...(payload as { request: VisibleProjectionRequest }).request,
          cells: [],
          revision: 0,
        }) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  render(
    <WorkbookStoreProvider connection={{ request, dispose() {} }} store={store}>
      <SelectionSizeTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    })
  })
  await click('Row and column size')
  return { resize }
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('size controls', () => {
  test.each(['row', 'column', 'reset'] as const)(
    '%s dispatches its single semantic command',
    async (axis) => {
      const { resize } = await setup()
      if (axis !== 'reset')
        fireEvent.change(
          screen.getByRole('spinbutton', { name: axis === 'row' ? 'Row height' : 'Column width' }),
          { target: { value: axis === 'row' ? '44' : '200' } },
        )
      await click(
        axis === 'row'
          ? 'Set row height'
          : axis === 'column'
            ? 'Set column width'
            : 'Reset selected sizes',
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(resize).toHaveBeenCalledTimes(1)
      expect(resize.mock.calls[0]?.[0]).toMatchObject({
        axis,
        pixels: axis === 'row' ? 44 : axis === 'column' ? 200 : 0,
        range: { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
      })
    },
  )
  test('Cancel does not call Rust', async () => {
    const { resize } = await setup()
    await click('Cancel')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resize).not.toHaveBeenCalled()
  })
  test('failed save shows an error and keeps editable values', async () => {
    const { resize } = await setup(true)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Row height' }), {
      target: { value: '44' },
    })
    await click('Set row height')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'))
    expect(screen.getByRole('spinbutton', { name: 'Row height' })).toHaveValue(44)
    await click('Set row height')
    await waitFor(() => expect(resize).toHaveBeenCalledTimes(2))
  })
})
