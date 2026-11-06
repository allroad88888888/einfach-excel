import { describe, expect, test } from 'vitest'
import {
  changeSheetDrawingAtom, drawingErrorAtom, projectionSnapshotAtom, refreshSheetDrawingsAtom,
  selectDrawingAtom, selectedDrawingAtom, sheetDrawingsAtom,
} from '../../src'
import { drawing, publishProjection, setupDrawings, switchSheet, WINDOW } from './fixture'

const ids = (list: readonly { id: string }[]) => list.map((entry) => entry.id)

describe('refreshSheetDrawingsAtom', () => {
  test('reads the active sheet once per projection revision', async () => {
    const { store, callsOf } = setupDrawings({ s: [drawing('a'), drawing('b')] })
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
    await store.setter(refreshSheetDrawingsAtom)
    expect(callsOf('drawings.read')).toEqual([{ sheetId: 's' }])
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a', 'b'])
    await store.setter(refreshSheetDrawingsAtom)
    expect(callsOf('drawings.read')).toHaveLength(1)
  })

  test('a new projection revision (edit, undo, structure change) triggers a re-read', async () => {
    const { store, rust, callsOf } = setupDrawings({ s: [drawing('a')] })
    await store.setter(refreshSheetDrawingsAtom)
    rust.sheets.s.push(drawing('b'))
    publishProjection(store, 's', 2)
    await store.setter(refreshSheetDrawingsAtom)
    expect(callsOf('drawings.read')).toHaveLength(2)
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a', 'b'])
  })

  test('does nothing without a published visible projection', async () => {
    const { store, request } = setupDrawings({}, false)
    await store.setter(refreshSheetDrawingsAtom)
    expect(await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('a') }))
      .toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  test('a failed read writes drawingErrorAtom and keeps the catalog empty', async () => {
    const { store, rust } = setupDrawings({ s: [drawing('a')] })
    rust.failWith = 'boom'
    await store.setter(refreshSheetDrawingsAtom)
    expect(store.getter(drawingErrorAtom)).toBe('boom')
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
  })

  test('a malformed reply is reported instead of cached', async () => {
    const { store, request } = setupDrawings()
    request.mockResolvedValueOnce({ drawings: 'nope', revision: 1 })
    await store.setter(refreshSheetDrawingsAtom)
    expect(store.getter(drawingErrorAtom)).toBe('Rust returned an invalid object list.')
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
  })

  test('the catalog is only visible on its own sheet and is re-read for the new sheet', async () => {
    const { store, rust, callsOf } = setupDrawings({ s: [drawing('a')], t: [drawing('x')] })
    await store.setter(refreshSheetDrawingsAtom)
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a'])
    expect(switchSheet(store, 't')).toBe(true)
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
    publishProjection(store, 't', rust.revision)
    await store.setter(refreshSheetDrawingsAtom)
    expect(callsOf('drawings.read')).toEqual([{ sheetId: 's' }, { sheetId: 't' }])
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['x'])
  })

  test('a read that finishes after the user switched sheets is discarded', async () => {
    const { store, rust } = setupDrawings({ s: [drawing('a')] })
    const pending = store.setter(refreshSheetDrawingsAtom)
    switchSheet(store, 't')
    await pending
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
    switchSheet(store, 's')
    expect(store.getter(sheetDrawingsAtom)).toEqual([])
    expect(rust.sheets.s).toHaveLength(1)
  })
})

describe('changeSheetDrawingAtom', () => {
  test('set sends one drawings.set carrying the drawing and a visible-window projection', async () => {
    const { store, callsOf, request } = setupDrawings()
    const next = drawing('a')
    expect(await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: next })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    const [payload] = callsOf('drawings.set')
    expect(payload).toMatchObject({ sheetId: 's', drawing: next,
      projection: { kind: 'visible-window', sheetId: 's', window: WINDOW, reason: 'toolbar' } })
    expect(typeof payload.projection.requestId).toBe('number')
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a'])
  })

  test('the reply projection is published and the catalog needs no extra read', async () => {
    const { store, rust, callsOf } = setupDrawings()
    await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('a') })
    expect(store.getter(projectionSnapshotAtom).result).toMatchObject({ revision: rust.revision })
    await store.setter(refreshSheetDrawingsAtom)
    expect(callsOf('drawings.read')).toHaveLength(0)
  })

  test('remove sends one drawings.remove and drops the object', async () => {
    const { store, callsOf, request } = setupDrawings({ s: [drawing('a'), drawing('b')] })
    await store.setter(refreshSheetDrawingsAtom)
    request.mockClear()
    expect(await store.setter(changeSheetDrawingAtom, { type: 'remove', id: 'a' })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(callsOf('drawings.remove')[0]).toMatchObject({ sheetId: 's', id: 'a' })
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['b'])
  })

  test('order sends one drawings.reorder with the direction and re-orders the catalog', async () => {
    const { store, callsOf, request } = setupDrawings({ s: [drawing('a'), drawing('b')] })
    await store.setter(refreshSheetDrawingsAtom)
    request.mockClear()
    await store.setter(changeSheetDrawingAtom, { type: 'order', id: 'a', toFront: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(callsOf('drawings.reorder')[0]).toMatchObject({ sheetId: 's', id: 'a', toFront: true })
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['b', 'a'])
    await store.setter(changeSheetDrawingAtom, { type: 'order', id: 'a', toFront: false })
    expect(callsOf('drawings.reorder')[1]).toMatchObject({ id: 'a', toFront: false })
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a', 'b'])
  })

  test('a Rust rejection writes drawingErrorAtom, returns false and keeps the catalog', async () => {
    const { store, rust } = setupDrawings({ s: [drawing('a')] })
    await store.setter(refreshSheetDrawingsAtom)
    rust.failWith = 'The sheet is protected.'
    expect(await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('b') }))
      .toBe(false)
    expect(store.getter(drawingErrorAtom)).toBe('The sheet is protected.')
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a'])
    rust.failWith = null
    expect(await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('b') }))
      .toBe(true)
    expect(store.getter(drawingErrorAtom)).toBeNull()
  })

  test('a reply that does not match the request is an error, not a published result', async () => {
    const { store, request } = setupDrawings()
    request.mockImplementationOnce(async (_command: string, payload: any) => ({ changed: true,
      drawings: [], projection: { ...payload.projection,
        requestId: payload.projection.requestId + 1, cells: [], revision: 9 } }))
    expect(await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('a') }))
      .toBe(false)
    expect(store.getter(drawingErrorAtom)).toBe('Rust returned a mismatched object result.')
    request.mockResolvedValueOnce({ changed: 'yes', drawings: [], projection: {} })
    await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('a') })
    expect(store.getter(drawingErrorAtom)).toBe('Rust returned a mismatched object result.')
  })

  test('returns the changed flag from Rust (removing a missing id changes nothing)', async () => {
    const { store } = setupDrawings({ s: [drawing('a')] })
    expect(await store.setter(changeSheetDrawingAtom, { type: 'remove', id: 'ghost' })).toBe(false)
  })

  test('removing the selected object clears the selection', async () => {
    const { store } = setupDrawings({ s: [drawing('a'), drawing('b')] })
    await store.setter(refreshSheetDrawingsAtom)
    store.setter(selectDrawingAtom, 'a')
    await store.setter(changeSheetDrawingAtom, { type: 'remove', id: 'b' })
    expect(store.getter(selectedDrawingAtom)?.id).toBe('a')
    await store.setter(changeSheetDrawingAtom, { type: 'remove', id: 'a' })
    expect(store.getter(selectedDrawingAtom)).toBeNull()
  })
})

describe('selectDrawingAtom and selectedDrawingAtom', () => {
  test('selecting an id exposes that object; null clears it', async () => {
    const { store } = setupDrawings({ s: [drawing('a'), drawing('b')] })
    await store.setter(refreshSheetDrawingsAtom)
    store.setter(selectDrawingAtom, 'b')
    expect(store.getter(selectedDrawingAtom)?.id).toBe('b')
    store.setter(selectDrawingAtom, null)
    expect(store.getter(selectedDrawingAtom)).toBeNull()
  })

  test('selecting an unknown id selects nothing', async () => {
    const { store } = setupDrawings({ s: [drawing('a')] })
    await store.setter(refreshSheetDrawingsAtom)
    store.setter(selectDrawingAtom, 'ghost')
    expect(store.getter(selectedDrawingAtom)).toBeNull()
  })

  test('selecting clears a previous error', async () => {
    const { store, rust } = setupDrawings()
    rust.failWith = 'boom'
    await store.setter(changeSheetDrawingAtom, { type: 'set', drawing: drawing('a') })
    expect(store.getter(drawingErrorAtom)).toBe('boom')
    store.setter(selectDrawingAtom, null)
    expect(store.getter(drawingErrorAtom)).toBeNull()
  })

  test('the selection belongs to its sheet and does not follow the user to another one', async () => {
    const { store, rust } = setupDrawings({ s: [drawing('a')], t: [drawing('a')] })
    await store.setter(refreshSheetDrawingsAtom)
    store.setter(selectDrawingAtom, 'a')
    switchSheet(store, 't')
    publishProjection(store, 't', rust.revision)
    await store.setter(refreshSheetDrawingsAtom)
    expect(ids(store.getter(sheetDrawingsAtom))).toEqual(['a'])
    expect(store.getter(selectedDrawingAtom)).toBeNull()
  })
})
