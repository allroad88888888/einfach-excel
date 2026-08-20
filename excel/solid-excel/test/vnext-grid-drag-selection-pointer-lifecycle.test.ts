import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  pointerIntentAtom,
  pointerSessionAtom,
  type CellCoord,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createGridDomAdapter } from '../src-vnext/grid/grid-dom-adapter'
import { installGridPointerSelection } from '../src-vnext/grid/grid-pointer-selection'

type PointerRuntime = Parameters<typeof installGridPointerSelection>[0]

function pointerEvent(
  type: string,
  { pointerId = 1, pointerType = 'touch' }: { pointerId?: number; pointerType?: string } = {},
): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  })
  return event as PointerEvent
}

function createFixture() {
  const store = createStore()
  let point: CellCoord | null = null
  const selectCellSpan = jest.fn((anchor: CellCoord, focus: CellCoord) => ({
    kind:
      anchor.row === focus.row && anchor.col === focus.col ? ('cell' as const) : ('range' as const),
    sheetId: 'sheet-1',
    anchor,
    focus,
  }))
  const runtime = {
    props: {
      sheetId: 'sheet-1',
      viewport: {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 100,
        viewportWidth: 100,
        rowHeight: 24,
        colWidth: 96,
        rowCount: 8,
        colCount: 8,
      },
    },
    store,
    backend: {} as SpreadsheetBackend,
    atoms: {},
    dom: createGridDomAdapter(),
    focusGrid: jest.fn(),
    getCellCoordFromPoint: () => point,
    selectCellSpan,
  }
  const pointer = installGridPointerSelection(runtime as unknown as PointerRuntime)

  return {
    pointer,
    selectCellSpan,
    setPoint: (nextPoint: CellCoord | null) => {
      point = nextPoint
    },
    store,
  }
}

afterEach(() => {
  jest.restoreAllMocks()
  document.body.replaceChildren()
  delete (document as { visibilityState?: string }).visibilityState
})

describe('vnext grid drag-selection pointer lifecycle', () => {
  it('returns the pointer atom to idle when a touch stream is cancelled', () => {
    const { pointer, store } = createFixture()

    pointer.startDragSelection(pointerEvent('pointerdown', { pointerId: 7 }), 0, 0)
    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { kind: 'drag-selection' },
    })

    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 7 }))

    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(pointerIntentAtom)).toBeNull()
  })

  it('ignores a foreign pointer until the initiating pointer moves and commits', () => {
    const { pointer, selectCellSpan, setPoint, store } = createFixture()

    pointer.startDragSelection(pointerEvent('pointerdown', { pointerId: 4 }), 0, 0)
    setPoint({ row: 3, col: 2 })
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 5 }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 5 }))

    expect(selectCellSpan).toHaveBeenCalledTimes(1)
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'active' })
    expect(store.getter(pointerIntentAtom)).toBeNull()

    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 4 }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 4 }))

    expect(selectCellSpan).toHaveBeenCalledTimes(2)
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      anchor: { row: 0, col: 0 },
      focus: { row: 3, col: 2 },
    })
  })

  it('cancels on focus loss, hidden visibility, and lost pointer capture', () => {
    const blurFixture = createFixture()
    blurFixture.pointer.startDragSelection(pointerEvent('pointerdown', { pointerId: 1 }), 0, 0)
    window.dispatchEvent(new Event('blur'))
    expect(blurFixture.store.getter(pointerSessionAtom)).toMatchObject({
      status: 'idle',
      interaction: null,
    })

    const visibilityFixture = createFixture()
    visibilityFixture.pointer.startDragSelection(
      pointerEvent('pointerdown', { pointerId: 2 }),
      0,
      0,
    )
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(visibilityFixture.store.getter(pointerSessionAtom)).toMatchObject({
      status: 'idle',
      interaction: null,
    })

    const captureFixture = createFixture()
    const target = document.createElement('div')
    Object.assign(target, {
      releasePointerCapture: jest.fn(),
      setPointerCapture: jest.fn(),
    })
    target.addEventListener('pointerdown', (event) => {
      captureFixture.pointer.startDragSelection(event as PointerEvent, 0, 0)
    })
    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3 }))
    target.dispatchEvent(pointerEvent('lostpointercapture', { pointerId: 3 }))

    expect(captureFixture.store.getter(pointerSessionAtom)).toMatchObject({
      status: 'idle',
      interaction: null,
    })
  })

  it('never captures a mouse pointer, so anchor-cell rerender cannot kill the drag', () => {
    // 回归护栏:9102d87 曾对鼠标也 setPointerCapture,捕获目标(锚点 <td>)在
    // pointerdown 当帧因选区写入被重渲染,lostpointercapture/click 重定向把拖拽
    // 塌回单格。鼠标必须走纯 window 监听流。
    const { pointer, store, selectCellSpan, setPoint } = createFixture()
    const target = document.createElement('div')
    const setPointerCapture = jest.fn()
    Object.assign(target, { releasePointerCapture: jest.fn(), setPointerCapture })
    target.addEventListener('pointerdown', (event) => {
      pointer.startDragSelection(event as PointerEvent, 0, 0)
    })
    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, pointerType: 'mouse' }))

    expect(setPointerCapture).not.toHaveBeenCalled()

    // 即使浏览器随后对该目标发出 lostpointercapture,鼠标会话也不受影响。
    target.dispatchEvent(pointerEvent('lostpointercapture', { pointerId: 7, pointerType: 'mouse' }))
    setPoint({ row: 2, col: 3 })
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse' }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, pointerType: 'mouse' }))

    expect(selectCellSpan).toHaveBeenLastCalledWith({ row: 0, col: 0 }, { row: 2, col: 3 })
    expect(store.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 3 },
    })
  })
})
