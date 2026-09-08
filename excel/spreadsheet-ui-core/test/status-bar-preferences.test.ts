import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  selectionStatisticsPreferencesAtom, configureSelectionStatisticsAtom,
  setSelectionAtom, type SelectionStatistic,
} from '../src'

test('six defaults remain in canonical order when hidden and restored', () => {
  const store = createStore()
  const read = () => store.getter(selectionStatisticsPreferencesAtom)
  const defaults = read().visible
  expect(defaults).toEqual(['count', 'numericCount', 'sum', 'average', 'min', 'max'])
  store.setter(configureSelectionStatisticsAtom, 'open')
  for (const statistic of defaults)
    store.setter(configureSelectionStatisticsAtom, { statistic, visible: false })
  expect(read()).toEqual({ open: true, visible: [] })
  store.setter(configureSelectionStatisticsAtom, { statistic: 'sum', visible: true })
  store.setter(configureSelectionStatisticsAtom, { statistic: 'count', visible: true })
  expect(read().visible).toEqual(['count', 'sum'])
  store.setter(configureSelectionStatisticsAtom, 'reset')
  expect(read()).toEqual({ open: true, visible: defaults })
  store.setter(configureSelectionStatisticsAtom, 'close')
  expect(read().open).toBe(false)
  expect('write' in selectionStatisticsPreferencesAtom).toBe(false)
})

test('preferences stay within their workbook store and survive sheet selection changes', () => {
  const a = createStore()
  const b = createStore()
  a.setter(configureSelectionStatisticsAtom, { statistic: 'sum', visible: false })
  a.setter(setSelectionAtom, { kind: 'cell', sheetId: 'another', anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
  expect(a.getter(selectionStatisticsPreferencesAtom).visible).not.toContain('sum')
  expect(b.getter(selectionStatisticsPreferencesAtom).visible).toContain('sum')
  a.setter(configureSelectionStatisticsAtom, { statistic: 'invalid' as SelectionStatistic, visible: true })
  expect(a.getter(selectionStatisticsPreferencesAtom).visible).toHaveLength(5)
  expect(Object.isFrozen(a.getter(selectionStatisticsPreferencesAtom).visible)).toBe(true)
})
