import { expect, test } from 'vitest'
import {
  applySelectionFormatAtom, selectCellAtom, setRustWorkbookConnectionAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { configurePatternFillAtom as configure, patternFillPanelAtom as panel } from '../src/core'
import { setup } from './fill-fixture'

test('pattern applies both colors in one native patch; solid and no-fill clear the descriptor', async () => {
  const { store, writes } = await setup()
  await store.setter(configure, 'open')
  await store.setter(configure, { type: 'pattern', value: 'darkUp' })
  await store.setter(configure, { type: 'foreground', value: '#AB1234' })
  await store.setter(configure, { type: 'background', value: '#FEDCBA' })
  expect(writes).toHaveLength(0)
  expect(await store.setter(configure, 'apply')).toBe(true)
  expect(writes[0]).toMatchObject({ writeMode: 'patch', format: {
    bgColor: '#fedcba', fill: { kind: 'pattern', pattern: 'darkUp', foreground: '#ab1234' },
  } })
  await store.setter(configure, 'open')
  expect(store.getter(panel)).toMatchObject({ pattern: 'darkUp', foreground: '#ab1234', background: '#fedcba' })
  await store.setter(configure, 'close')
  expect(writes).toHaveLength(1)
  await store.setter(applySelectionFormatAtom, { type: 'fill-color', value: '#00ff00' })
  expect(writes[1]).toMatchObject({ format: { bgColor: '#00ff00' }, clearFormatFields: ['fill'] })
  await store.setter(applySelectionFormatAtom, { type: 'fill-color', value: null })
  expect(writes[2]).toMatchObject({ format: {}, clearFormatFields: ['bgColor', 'fill'] })
})

test('invalid colors retain the draft; a changed selection cannot receive an old draft', async () => {
  const { store, writes } = await setup()
  await store.setter(configure, 'open')
  await store.setter(configure, { type: 'foreground', value: 'red' })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel)).toMatchObject({ error: 'invalid', foreground: 'red', open: true })
  await store.setter(configure, { type: 'foreground', value: '#c00000' })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
  // Returning to the same coordinate still invalidates the captured selection authority.
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('selection')
  expect(writes).toHaveLength(0)
})

test('pending rejects re-entry and native failure preserves a correctable draft', async () => {
  const state = await setup()
  await state.store.setter(configure, 'open')
  state.fail(true)
  expect(await state.store.setter(configure, 'apply')).toBe(false)
  expect(state.store.getter(panel)).toMatchObject({ error: 'failed', open: true, busy: false })
  state.fail(false); state.hold()
  const pending = state.store.setter(configure, 'apply')
  expect(state.store.getter(panel).busy).toBe(true)
  expect(await state.store.setter(configure, 'apply')).toBe(false)
  expect(await state.store.setter(configure, 'close')).toBe(false)
  expect(await state.store.setter(configure, { type: 'pattern', value: 'darkDown' })).toBe(false)
  state.release()
  expect(await pending).toBe(true)
  expect(state.writes).toHaveLength(2)
  expect(state.store.getter(panel).open).toBe(false)
})

test('drafts are store-local and an old in-flight result cannot publish into a new connection', async () => {
  const first = await setup(), second = await setup()
  await first.store.setter(configure, 'open')
  await first.store.setter(configure, { type: 'pattern', value: 'gray0625' })
  expect(second.store.getter(panel).open).toBe(false)
  first.hold()
  const pending = first.store.setter(configure, 'apply')
  first.store.setter(setRustWorkbookConnectionAtom, second.connection)
  expect(first.store.getter(panel).open).toBe(false)
  await first.store.setter(configure, 'open')
  expect(first.store.getter(panel).pattern).toBe('lightDown')
  first.release()
  expect(await pending).toBe(false)
  expect(first.store.getter(panel)).toMatchObject({ open: true, busy: false, error: null, pattern: 'lightDown' })
  expect(second.writes).toHaveLength(0)
})
