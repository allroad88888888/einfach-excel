import { createStore } from '@einfach/core'
import { workbookRibbonTabAtom } from '@einfach-excel/spreadsheet-ui-core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { RibbonTabs } from '../../../src/workbook/chrome/ribbon/RibbonTabs'

function setup() {
  const store = createStore()
  render(<WorkbookStoreProvider store={store}><RibbonTabs id="commands" /></WorkbookStoreProvider>)
  return store
}

test('click selects one tab and preserves the shared panel ARIA relationship', () => {
  const store = setup()
  fireEvent.click(screen.getByRole('tab', { name: 'Formulas' }))
  expect(store.getter(workbookRibbonTabAtom)).toBe('Formulas')
  for (const tab of screen.getAllByRole('tab')) {
    const active = tab.textContent === 'Formulas'
    expect(tab).toHaveAttribute('aria-selected', String(active))
    expect(tab).toHaveAttribute('tabindex', active ? '0' : '-1')
    expect(tab).toHaveAttribute('aria-controls', 'commands-panel')
  }
})

test.each([
  ['Start', 'ArrowRight', 'Insert'], ['Start', 'ArrowLeft', 'View'],
  ['View', 'ArrowRight', 'Start'], ['View', 'ArrowLeft', 'Data'],
  ['Data', 'Home', 'Start'], ['Insert', 'End', 'View'],
] as const)('%s + %s moves selection and focus to %s', (from, key, to) => {
  const store = setup()
  const source = screen.getByRole('tab', { name: from })
  fireEvent.click(source)
  source.focus()
  expect(fireEvent.keyDown(source, { key })).toBe(false)
  const target = screen.getByRole('tab', { name: to })
  expect(target).toHaveFocus()
  expect(target).toHaveAttribute('tabindex', '0')
  expect(target).toHaveAttribute('aria-selected', 'true')
  expect(store.getter(workbookRibbonTabAtom)).toBe(to)
  expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toEqual([target])
})

test('unhandled keys keep selection and normal browser behavior', () => {
  const store = setup()
  const start = screen.getByRole('tab', { name: 'Start' })
  start.focus()
  expect(fireEvent.keyDown(start, { key: 'Tab' })).toBe(true)
  expect(start).toHaveFocus()
  expect(store.getter(workbookRibbonTabAtom)).toBe('Start')
})

test('two workbook tablists keep independent state and focus stays inside the owner', () => {
  const first = createStore()
  const second = createStore()
  render(<>
    <WorkbookStoreProvider store={first}><RibbonTabs id="first" /></WorkbookStoreProvider>
    <WorkbookStoreProvider store={second}><RibbonTabs id="second" /></WorkbookStoreProvider>
  </>)
  const lists = screen.getAllByRole('tablist')
  fireEvent.keyDown(within(lists[1]).getByRole('tab', { name: 'Start' }), { key: 'End' })
  expect(first.getter(workbookRibbonTabAtom)).toBe('Start')
  expect(second.getter(workbookRibbonTabAtom)).toBe('View')
  expect(within(lists[1]).getByRole('tab', { name: 'View' })).toHaveFocus()
  expect(within(lists[0]).getByRole('tab', { name: 'Start' }))
    .toHaveAttribute('aria-selected', 'true')
})
