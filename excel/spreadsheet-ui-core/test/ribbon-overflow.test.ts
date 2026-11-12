import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  reportWorkbookRibbonOverflowAtom,
  setWorkbookRibbonExpandedAtom,
  workbookRibbonOverflowAtom,
} from '../src/toolbar/ribbon-overflow'
import { selectWorkbookRibbonTabAtom } from '../src/toolbar/ribbon-tab'

test('the More panel cannot open until the view reports collapsed groups', () => {
  const store = createStore()
  store.setter(setWorkbookRibbonExpandedAtom, true)
  expect(store.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 0, expanded: false })
  store.setter(reportWorkbookRibbonOverflowAtom, 2)
  store.setter(setWorkbookRibbonExpandedAtom, true)
  expect(store.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 2, expanded: true })
})

test('fewer collapsed groups keep the panel open; none closes it', () => {
  const store = createStore()
  store.setter(reportWorkbookRibbonOverflowAtom, 3)
  store.setter(setWorkbookRibbonExpandedAtom, true)
  store.setter(reportWorkbookRibbonOverflowAtom, 1)
  expect(store.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 1, expanded: true })
  store.setter(reportWorkbookRibbonOverflowAtom, 0)
  expect(store.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 0, expanded: false })
})

test('invalid counts are treated as no collapse', () => {
  const store = createStore()
  store.setter(reportWorkbookRibbonOverflowAtom, 2)
  store.setter(reportWorkbookRibbonOverflowAtom, -1)
  expect(store.getter(workbookRibbonOverflowAtom).collapsed).toBe(0)
  store.setter(reportWorkbookRibbonOverflowAtom, 1.5)
  expect(store.getter(workbookRibbonOverflowAtom).collapsed).toBe(0)
})

test('switching category clears the collapse so the new category is measured afresh', () => {
  const store = createStore()
  store.setter(reportWorkbookRibbonOverflowAtom, 2)
  store.setter(setWorkbookRibbonExpandedAtom, true)
  store.setter(selectWorkbookRibbonTabAtom, 'Data')
  expect(store.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 0, expanded: false })
})

test('re-selecting the active category keeps the measured collapse', () => {
  const store = createStore()
  store.setter(reportWorkbookRibbonOverflowAtom, 2)
  store.setter(selectWorkbookRibbonTabAtom, 'Start')
  expect(store.getter(workbookRibbonOverflowAtom).collapsed).toBe(2)
})

test('collapse state is scoped to each workbook store', () => {
  const first = createStore()
  const second = createStore()
  first.setter(reportWorkbookRibbonOverflowAtom, 1)
  first.setter(setWorkbookRibbonExpandedAtom, true)
  expect(second.getter(workbookRibbonOverflowAtom)).toEqual({ collapsed: 0, expanded: false })
})
