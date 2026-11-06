import { describe, expect, test } from 'vitest'
import {
  copyDrawingAtom, dragDrawingAtom, drawingClipboardAtom, drawingDragAtom, drawingMenuAtom,
  openDrawingMenuAtom, pasteDrawingAtom, refreshSheetDrawingsAtom, selectedDrawingAtom,
  sheetDrawingsAtom,
} from '../../src'
import { drawing, publishProjection, setupDrawings, switchSheet } from './fixture'

async function loaded(initial = { s: [drawing('a')] }) {
  const setup = setupDrawings(initial)
  await setup.store.setter(refreshSheetDrawingsAtom)
  setup.request.mockClear()
  return setup
}
const idsOf = (store: ReturnType<typeof setupDrawings>['store']) =>
  store.getter(sheetDrawingsAtom).map((entry) => entry.id)

describe('dragDrawingAtom', () => {
  test('start selects the object and previews from its content rectangle', async () => {
    const { store, request } = await loaded()
    expect(await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })).toBe(true)
    expect(store.getter(selectedDrawingAtom)?.id).toBe('a')
    expect(store.getter(drawingDragAtom)).toMatchObject({ sheetId: 's', id: 'a', handle: 'move',
      start: { left: 305, top: 47, width: 200, height: 100 },
      current: { left: 305, top: 47, width: 200, height: 100 } })
    expect(request).not.toHaveBeenCalled()
  })

  test('start on an unknown object does nothing', async () => {
    const { store } = await loaded()
    expect(await store.setter(dragDrawingAtom, { type: 'start', id: 'ghost', handle: 'move' }))
      .toBe(false)
    expect(store.getter(drawingDragAtom)).toBeNull()
  })

  test('move only updates the preview; the Rust catalog is untouched until release', async () => {
    const { store, request, rust } = await loaded()
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 100, dy: 40 })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 120, dy: 60 })
    expect(store.getter(drawingDragAtom)?.current)
      .toEqual({ left: 425, top: 107, width: 200, height: 100 })
    expect(request).not.toHaveBeenCalled()
    expect(rust.sheets.s[0]!.anchor.col).toBe(3)
  })

  test('move ignores non-finite deltas and a move without a drag', async () => {
    const { store } = await loaded()
    expect(await store.setter(dragDrawingAtom, { type: 'move', dx: 1, dy: 1 })).toBe(false)
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    expect(await store.setter(dragDrawingAtom, { type: 'move', dx: Number.NaN, dy: 1 })).toBe(false)
    expect(store.getter(drawingDragAtom)?.current.left).toBe(305)
  })

  test('finish commits exactly one drawings.set with the anchor of the dropped position', async () => {
    const { store, callsOf, request } = await loaded()
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 100, dy: 40 })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 100, dy: 40 })
    expect(await store.setter(dragDrawingAtom, { type: 'finish' })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(callsOf('drawings.set')[0].drawing).toMatchObject({ id: 'a', payload: { title: 'a' },
      anchor: { row: 4, col: 4, offsetX: 5, offsetY: 7, width: 200, height: 100 } })
    expect(store.getter(drawingDragAtom)).toBeNull()
    expect(store.getter(sheetDrawingsAtom)[0]!.anchor).toMatchObject({ row: 4, col: 4 })
  })

  test('a resize handle commits the new size from the fixed opposite corner', async () => {
    const { store, callsOf } = await loaded()
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'se' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 50, dy: 20 })
    await store.setter(dragDrawingAtom, { type: 'finish' })
    expect(callsOf('drawings.set')[0].drawing.anchor)
      .toEqual({ row: 2, col: 3, offsetX: 5, offsetY: 7, width: 250, height: 120 })
  })

  test('a press without movement, or a sub-pixel wobble, leaves only the selection', async () => {
    const { store, request } = await loaded()
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    expect(await store.setter(dragDrawingAtom, { type: 'finish' })).toBe(false)
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 0.4, dy: -0.3 })
    expect(await store.setter(dragDrawingAtom, { type: 'finish' })).toBe(false)
    expect(request).not.toHaveBeenCalled()
    expect(store.getter(selectedDrawingAtom)?.id).toBe('a')
    expect(store.getter(drawingDragAtom)).toBeNull()
  })

  test('cancel drops the preview without any request', async () => {
    const { store, request } = await loaded()
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 300, dy: 300 })
    expect(await store.setter(dragDrawingAtom, { type: 'cancel' })).toBe(false)
    expect(store.getter(drawingDragAtom)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  test('finish after switching sheets does not write to the new sheet', async () => {
    const { store, request } = await loaded({ s: [drawing('a')] })
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 200, dy: 0 })
    switchSheet(store, 't')
    expect(await store.setter(dragDrawingAtom, { type: 'finish' })).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  test('a Rust failure on release is reported through the change atom and returns false', async () => {
    const { store, rust } = await loaded()
    rust.failWith = 'protected'
    await store.setter(dragDrawingAtom, { type: 'start', id: 'a', handle: 'move' })
    await store.setter(dragDrawingAtom, { type: 'move', dx: 200, dy: 0 })
    expect(await store.setter(dragDrawingAtom, { type: 'finish' })).toBe(false)
    expect(store.getter(sheetDrawingsAtom)[0]!.anchor.col).toBe(3)
  })
})

describe('copyDrawingAtom and pasteDrawingAtom', () => {
  test('copy fills the clipboard without touching Rust', async () => {
    const { store, request } = await loaded()
    expect(store.getter(drawingClipboardAtom)).toEqual({ available: false, pasteHere: false })
    expect(await store.setter(copyDrawingAtom, { id: 'a' })).toBe(true)
    expect(store.getter(drawingClipboardAtom)).toEqual({ available: true, pasteHere: true })
    expect(request).not.toHaveBeenCalled()
    expect(await store.setter(copyDrawingAtom, { id: 'ghost' })).toBe(false)
  })

  test('paste on the same sheet is a new object, offset by 20px and selected', async () => {
    const { store, callsOf } = await loaded()
    await store.setter(copyDrawingAtom, { id: 'a' })
    expect(await store.setter(pasteDrawingAtom)).toBe(true)
    const [call] = callsOf('drawings.set')
    expect(call.drawing).toMatchObject({ id: 'chart-2', kind: 'chart', payload: { title: 'a' },
      anchor: { row: 2, col: 3, offsetX: 25, offsetY: 27, width: 200, height: 100 } })
    expect(idsOf(store)).toEqual(['a', 'chart-2'])
    expect(store.getter(selectedDrawingAtom)?.id).toBe('chart-2')
  })

  test('repeated paste staggers further and never reuses an id', async () => {
    const { store } = await loaded()
    await store.setter(copyDrawingAtom, { id: 'a' })
    await store.setter(pasteDrawingAtom)
    await store.setter(pasteDrawingAtom)
    await store.setter(pasteDrawingAtom)
    const drawings = store.getter(sheetDrawingsAtom)
    expect(drawings.map((entry) => entry.id)).toEqual(['a', 'chart-2', 'chart-3', 'chart-4'])
    expect(drawings.map((entry) => entry.anchor.offsetX)).toEqual([5, 25, 45, 65])
    expect(drawings.map((entry) => entry.anchor.offsetY)).toEqual([7, 27, 47, 67])
  })

  test('paste at a cell lands on that cell corner and keeps the source for the next paste', async () => {
    const { store, callsOf } = await loaded()
    await store.setter(copyDrawingAtom, { id: 'a' })
    await store.setter(pasteDrawingAtom, { row: 10, col: 6 })
    await store.setter(pasteDrawingAtom)
    const [first, second] = callsOf('drawings.set')
    expect(first.drawing.anchor).toMatchObject({ row: 10, col: 6, offsetX: 0, offsetY: 0 })
    expect(second.drawing.anchor).toMatchObject({ row: 2, col: 3, offsetX: 25, offsetY: 27 })
  })

  test('the pasted offset is capped at the maximum drawing size', async () => {
    const { store, callsOf } = await loaded({ s: [drawing('a', { anchor: { row: 0, col: 0,
      offsetX: 9_995, offsetY: 0, width: 50, height: 50 } })] })
    await store.setter(copyDrawingAtom, { id: 'a' })
    await store.setter(pasteDrawingAtom)
    expect(callsOf('drawings.set')[0].drawing.anchor.offsetX).toBe(10_000)
  })

  test('cut removes the original in one request and can be pasted back with the same id', async () => {
    const { store, callsOf, request } = await loaded()
    expect(await store.setter(copyDrawingAtom, { id: 'a', cut: true })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(callsOf('drawings.remove')[0]).toMatchObject({ sheetId: 's', id: 'a' })
    expect(idsOf(store)).toEqual([])
    expect(await store.setter(pasteDrawingAtom, { row: 0, col: 0 })).toBe(true)
    expect(idsOf(store)).toEqual(['a'])
  })

  test('a failed cut still leaves the object on the sheet', async () => {
    const { store, rust } = await loaded()
    rust.failWith = 'protected'
    expect(await store.setter(copyDrawingAtom, { id: 'a', cut: true })).toBe(false)
    expect(idsOf(store)).toEqual(['a'])
  })

  test('paste on another sheet keeps drawing the source data', async () => {
    const own = { startRow: 0, startCol: 0, endRow: 4, endCol: 1 }
    const { store, callsOf } = await loaded({ s: [drawing('a', {
      refs: [own, { ...own, sheetId: 't' }, null] })] })
    await store.setter(copyDrawingAtom, { id: 'a' })
    switchSheet(store, 't')
    publishProjection(store, 't', 1)
    expect(store.getter(drawingClipboardAtom)).toEqual({ available: true, pasteHere: true })
    expect(await store.setter(pasteDrawingAtom, { row: 1, col: 1 })).toBe(true)
    const [call] = callsOf('drawings.set')
    expect(call.sheetId).toBe('t')
    // 同表引用改指来源表；原本指向目标表的引用变回同表；#REF! 保持。
    expect(call.drawing.refs).toEqual([{ ...own, sheetId: 's' }, own, null])
  })

  test('paste with an empty clipboard does nothing', async () => {
    const { store, request } = await loaded()
    expect(await store.setter(pasteDrawingAtom)).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('openDrawingMenuAtom', () => {
  test('opens at the pointer and selects the object', async () => {
    const { store } = await loaded()
    store.setter(openDrawingMenuAtom, { id: 'a', x: 120, y: 80 })
    expect(store.getter(drawingMenuAtom)).toEqual({ sheetId: 's', id: 'a', x: 120, y: 80 })
    expect(store.getter(selectedDrawingAtom)?.id).toBe('a')
  })

  test('null closes the menu and keeps the selection', async () => {
    const { store } = await loaded()
    store.setter(openDrawingMenuAtom, { id: 'a', x: 1, y: 2 })
    store.setter(openDrawingMenuAtom, null)
    expect(store.getter(drawingMenuAtom)).toBeNull()
    expect(store.getter(selectedDrawingAtom)?.id).toBe('a')
  })

  test('switching sheets hides the menu', async () => {
    const { store } = await loaded()
    store.setter(openDrawingMenuAtom, { id: 'a', x: 1, y: 2 })
    switchSheet(store, 't')
    expect(store.getter(drawingMenuAtom)).toBeNull()
    switchSheet(store, 's')
    expect(store.getter(drawingMenuAtom)).toMatchObject({ id: 'a' })
  })
})
