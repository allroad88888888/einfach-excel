import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  setViewportMetricsAtom,
  fillHandleDragAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FillHandle } from '../../../src/workbook/grid/fill/FillHandle'

afterEach(() => vi.unstubAllGlobals())
type Input = RustWorkbookCommands['range.fill']['payload']
async function setup() {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const fill = vi.fn(async (p: Input) => ({
    acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
    projection: { ...p.projection, cells: [], revision: 1 },
    sizes: { rowHeights: [], colWidths: [] },
  }))
  const request = (async (cmd: string, p: unknown) => cmd === 'range.fill' ? fill(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
  ) as RustWorkbookConnection['request']
  const store = createStore()
  const ref = createRef<HTMLDivElement>()
  const focus = vi.fn()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setViewportMetricsAtom, { sheetId: 's', rowCount: 100, colCount: 8,
    rowHeight: 28, colWidth: 120, viewportWidth: 600, viewportHeight: 400,
    scrollTop: 0, scrollLeft: 0, overscanRows: 2, overscanCols: 2 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <div ref={ref}><FillHandle scrollRef={ref} focusGrid={focus} /></div>
  </WorkbookStoreProvider>)
  Object.defineProperties(ref.current, {
    clientWidth: { value: 646 }, clientHeight: { value: 428 },
  })
  ref.current!.getBoundingClientRect = () => ({ left: 0, top: 0, right: 646, bottom: 428,
    width: 646, height: 428, x: 0, y: 0, toJSON() {} })
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  })
  const button = screen.getByRole('button', { name: 'Drag to fill' })
  button.setPointerCapture = vi.fn()
  button.hasPointerCapture = vi.fn(() => true)
  button.releasePointerCapture = vi.fn()
  const event = async (
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', copy = false,
  ) => {
    await act(async () => {
      fireEvent[type](button, { button: 0, clientX: 100, clientY: 150, ctrlKey: copy })
    })
  }
  return { store, fill, button, focus, event }
}

test('pointer capture drives preview, live modifier and one native command', async () => {
  const { store, fill, button, focus, event } = await setup()
  await event('pointerDown')
  expect(button.setPointerCapture).toHaveBeenCalledTimes(1)
  await event('pointerMove')
  expect(screen.getByTestId('fill-preview')).toBeInTheDocument()
  expect(store.getter(fillHandleDragAtom)?.direction).toBe('down')
  expect(fill).not.toHaveBeenCalled()
  await act(async () => { fireEvent.keyDown(window, { key: 'Control', ctrlKey: true }) })
  expect(button).toHaveAttribute('data-mode', 'copy')
  await event('pointerUp', true)
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.lastCall![0].request).toMatchObject({ direction: 'down', auto: false,
    sourceRange: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 } })
  expect(screen.queryByTestId('fill-preview')).toBeNull()
  expect(focus).toHaveBeenCalledTimes(1)
})

test.each(['Escape', 'pointerCancel', 'blur'])('%s cancels captured drag without a mutation', async (cancel) => {
  const { fill, event, button } = await setup()
  await event('pointerDown')
  await event('pointerMove')
  await act(async () => {
    if (cancel === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
    else if (cancel === 'blur') fireEvent.blur(window)
    else fireEvent.pointerCancel(button)
  })
  await event('pointerUp')
  expect(screen.queryByTestId('fill-preview')).toBeNull()
  expect(fill).not.toHaveBeenCalled()
  expect(button.releasePointerCapture).toHaveBeenCalled()
})
