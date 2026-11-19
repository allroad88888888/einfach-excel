import { expect, test } from 'vitest'
import { selectCellAtom, setRustWorkbookConnectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureGradientFillAtom as configure, gradientFillPanelAtom as panel } from '../src/core'
import { setup } from './fill-fixture'

test('Apply writes one native patch with C(0), full stops and only the active geometry', async () => {
  const stops = [{ position: 1, color: '#0000ff' }, { position: 0.5, color: '#00ff00' },
    { position: 0, color: '#ff0000' }]
  const { store, writes } = await setup({ fill: { kind: 'linear-gradient', degree: -450, stops }, bgColor: '#abcdef' })
  await store.setter(configure, 'open')
  await store.setter(configure, { type: 'mode', value: 'path-gradient' })
  await store.setter(configure, { type: 'left', value: '80' })
  await store.setter(configure, { type: 'right', value: '20' })
  await store.setter(configure, { type: 'mode', value: 'linear-gradient' })
  expect(store.getter(panel).draft.angle.value).toBe(-450)
  await store.setter(configure, { type: 'mode', value: 'path-gradient' })
  expect(writes).toHaveLength(0)
  expect(await store.setter(configure, 'apply')).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0].format).toEqual({ bgColor: '#ff0000', fill: {
    kind: 'path-gradient', left: 0.8, right: 0.2, top: 0.5, bottom: 0.5, stops,
  } })
  expect(store.getter(panel).open).toBe(false)
})

test('invalid geometry is correctable but returning to the old selection does not reauthorize the draft', async () => {
  const { store, writes } = await setup()
  await store.setter(configure, 'open')
  await store.setter(configure, { type: 'angle', value: 'Infinity' })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel)).toMatchObject({ open: true, error: 'invalidGradient' })
  await store.setter(configure, { type: 'angle', value: '-450' })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('selection')
  expect(writes).toHaveLength(0)
})

test('native failure keeps the draft and pending blocks every reentry', async () => {
  const state = await setup()
  await state.store.setter(configure, 'open')
  state.fail(true)
  expect(await state.store.setter(configure, 'apply')).toBe(false)
  expect(state.store.getter(panel)).toMatchObject({ open: true, error: 'failed', busy: false })
  state.fail(false); state.hold()
  const pending = state.store.setter(configure, 'apply')
  expect(state.store.getter(panel).busy).toBe(true)
  expect(await state.store.setter(configure, 'apply')).toBe(false)
  expect(await state.store.setter(configure, 'close')).toBe(false)
  expect(await state.store.setter(configure, { type: 'angle', value: '90' })).toBe(false)
  state.release()
  expect(await pending).toBe(true)
  expect(state.writes).toHaveLength(2)
})

test('stores isolate drafts and old in-flight results cannot close a replacement connection draft', async () => {
  const first = await setup(), second = await setup()
  await first.store.setter(configure, 'open')
  await first.store.setter(configure, { type: 'angle', value: '123' })
  expect(second.store.getter(panel).open).toBe(false)
  first.hold()
  const pending = first.store.setter(configure, 'apply')
  first.store.setter(setRustWorkbookConnectionAtom, second.connection)
  expect(first.store.getter(panel).open).toBe(false)
  await first.store.setter(configure, 'open')
  first.release()
  expect(await pending).toBe(false)
  expect(first.store.getter(panel)).toMatchObject({ open: true, busy: false,
    error: null, draft: { angle: { value: 0 } } })
  expect(second.writes).toHaveLength(0)
})
