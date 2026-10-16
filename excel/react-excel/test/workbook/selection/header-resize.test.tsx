import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  resizeDragAtom,
  selectCellAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { GridHeading } from '../../../src/workbook/grid/viewport/GridHeading'
import { SelectionSizeTools } from '../../../src/workbook/chrome/ribbon/SelectionSizeTools'

vi.mock('../../../src/workbook/grid/viewport/read-auto-fit-layout', () => ({
  readAutoFitLayout: () => ({ fontFamily: 'Arial', fontSize: 12, lineHeight: 14.4 }),
}))

async function setup() {
  const project = (p: VisibleProjectionRequest) => ({ ...p, cells: [], revision: 1 })
  const resize = vi.fn(async (p: RustWorkbookCommands['range.resize']['payload']) => ({
    projection: project(p.projection),
    sizes: { rowHeights: [], colWidths: [{ colIndex: 1, widthPx: p.pixels }] },
  }))
  const request = (async (command: string, p: unknown) =>
    command === 'range.resize'
      ? resize(p as RustWorkbookCommands['range.resize']['payload'])
      : project(
          (p as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  const view = render(
    <WorkbookStoreProvider store={store}>
      <GridHeading axis="column" index={1} focusGrid={() => {}} />
      <SelectionSizeTools />
    </WorkbookStoreProvider>,
  )
  return { resize, store, view }
}

test.each(['Escape', 'blur', 'lostpointercapture', 'unmount'])(
  '%s cancels a resize draft without committing and allows a fresh drag', async (reason) => {
    const { resize, store, view } = await setup()
    const handle = screen.getByRole('separator', { name: 'Resize column B' })
    const release = vi.fn()
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: release },
    })
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 }, button: { value: 0 }, isPrimary: { value: true },
        clientX: { value: x }, clientY: { value: 0 },
      })
      fireEvent(handle, event)
    }
    const before = handle.getAttribute('aria-valuenow')
    pointer('pointerdown', 100)
    pointer('pointermove', 150)
    expect(handle).toHaveAttribute('aria-valuenow', String(Number(before) + 50))
    if (reason === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
    else if (reason === 'blur') fireEvent(window, new Event('blur'))
    else if (reason === 'unmount') view.unmount()
    else pointer(reason, 150)
    expect(store.getter(resizeDragAtom)).toBeNull()
    expect(resize).not.toHaveBeenCalled()
    if (reason === 'Escape' || reason === 'blur') expect(release).toHaveBeenCalledWith(7)
    if (reason === 'unmount') return
    expect(handle).toHaveAttribute('aria-valuenow', before)
    // 取消后旧 pointerup 不能落库；新的拖拽仍可正常提交一次。
    await act(async () => pointer('pointerup', 150))
    expect(resize).not.toHaveBeenCalled()
    pointer('pointerdown', 100)
    pointer('pointermove', 120)
    await act(async () => pointer('pointerup', 120))
    expect(resize).toHaveBeenCalledTimes(1)
    expect(resize.mock.calls[0][0].pixels).toBe(Number(before) + 20)
  },
)

test('keyboard handle resizing uses one command without opening a dialog', async () => {
  const { resize } = await setup()
  const handle = screen.getByRole('separator', { name: 'Resize column B' })
  const before = Number(handle.getAttribute('aria-valuenow'))
  await act(async () => {
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
  })
  expect(resize).toHaveBeenCalledTimes(1)
  expect(resize.mock.calls[0][0]).toMatchObject({ axis: 'column', pixels: before + 10 })
  expect(handle).toHaveAttribute('aria-valuenow', String(before + 10))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('pointer capture cancellation clears the preview without writing', async () => {
  const { resize } = await setup()
  const handle = screen.getByRole('separator', { name: 'Resize column B' })
  const capture = vi.fn()
  Object.defineProperty(handle, 'setPointerCapture', { value: capture })
  const before = handle.getAttribute('aria-valuenow')
  for (const [type, x] of [
    ['pointerdown', 100],
    ['pointermove', 150],
    ['pointercancel', 150],
  ] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      pointerId: { value: 7 },
      button: { value: 0 },
      isPrimary: { value: true },
      clientX: { value: x },
      clientY: { value: 0 },
    })
    fireEvent(handle, event)
    if (type === 'pointermove')
      expect(handle).toHaveAttribute('aria-valuenow', String(Number(before) + 50))
  }
  expect(capture).toHaveBeenCalledWith(7)
  expect(handle).toHaveAttribute('aria-valuenow', before)
  expect(resize).not.toHaveBeenCalled()
})

test('a native rejection is readable outside the size dialog', async () => {
  const { resize } = await setup()
  resize.mockRejectedValueOnce(new Error('Resize denied'))
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize column B' }), {
      key: 'ArrowRight',
    })
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Resize denied')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test.each(['double-click', 'Enter'])(
  '%s dispatches one automatic size command',
  async (gesture) => {
    const { resize } = await setup()
    const handle = screen.getByRole('separator', { name: 'Resize column B' })
    await act(async () => {
      if (gesture === 'Enter') fireEvent.keyDown(handle, { key: 'Enter' })
      else fireEvent.doubleClick(handle)
    })
    expect(resize).toHaveBeenCalledTimes(1)
    expect(resize.mock.calls[0][0]).toMatchObject({
      axis: 'column',
      autoFit: { fontFamily: 'Arial', fontSize: 12 },
      range: { rowStart: 0, rowEnd: 99, colStart: 1, colEnd: 1 },
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  },
)
