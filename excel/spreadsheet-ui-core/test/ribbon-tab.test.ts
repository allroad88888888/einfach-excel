import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { workbookRibbonTabAtom, selectWorkbookRibbonTabAtom } from '../src/toolbar/ribbon-tab'

test('ribbon category is independently scoped to each workbook store', () => {
  const first = createStore()
  const second = createStore()
  expect(first.getter(workbookRibbonTabAtom)).toBe('Start')
  first.setter(selectWorkbookRibbonTabAtom, 'Data')
  expect(first.getter(workbookRibbonTabAtom)).toBe('Data')
  expect(second.getter(workbookRibbonTabAtom)).toBe('Start')
  first.setter(selectWorkbookRibbonTabAtom, 'Start')
  expect(first.getter(workbookRibbonTabAtom)).toBe('Start')
})
