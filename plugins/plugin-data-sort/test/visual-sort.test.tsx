import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { dataSortPlugin } from '../src'
import { configureVisualSortAtom, visualSortPanelAtom } from '../src/core'
import { setup } from './sort-fixture'

test('horizontal sort validates row bounds on apply and rejects header option', async () => {
  const { store, sort } = await setup()
  await store.setter(configureVisualSortAtom, 'open-horizontal')
  expect(await store.setter(configureVisualSortAtom, { type: 'header', value: true })).toBe(false)
  await store.setter(configureVisualSortAtom, {
    type: 'key', index: 0, key: { row: Number.NaN, direction: 'asc' },
  })
  expect(await store.setter(configureVisualSortAtom, 'apply')).toBe(false)
  expect(sort).not.toHaveBeenCalled()
  expect(store.getter(visualSortPanelAtom).error).toBe('failed')
  expect(store.getter(visualSortPanelAtom).detail).toContain('rows inside the selected range')
})

test('vertical color sort forwards caseSensitive and emptyFirst options to Rust', async () => {
  const { store, sort } = await setup()
  await store.setter(configureVisualSortAtom, 'open')
  await store.setter(configureVisualSortAtom, { type: 'case', value: true })
  await store.setter(configureVisualSortAtom, { type: 'empty', value: true })
  expect(await store.setter(configureVisualSortAtom, 'apply')).toBe(true)
  expect(sort).toHaveBeenCalledTimes(1)
  expect(sort.mock.calls[0]![0]).toMatchObject({ caseSensitive: true, emptyFirst: true })
})

test('moving a visual sort level transfers focus to the moved level control', async () => {
  const { store } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[dataSortPlugin]}>
    <PluginPanels />
  </WorkbookStoreProvider>)
  await act(async () => { await store.setter(configureVisualSortAtom, 'open') })
  await act(async () => { await store.setter(configureVisualSortAtom, 'add') })
  const dialog = screen.getByRole('dialog', { name: 'Color sort' })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move sort level 2 up' }))
  })
  expect(within(dialog).getByLabelText('Sort column 1')).toHaveFocus()
})
