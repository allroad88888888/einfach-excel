import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { setFillSeriesLocaleAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { WorkbookRibbon } from '../../../excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { createWorkbookI18n } from '../../../excel/react-excel/src/i18n/runtime'
import { dataSortPlugin } from '../src'
import { setup, sorted } from './sort-fixture'

test('the plugin owns its dialog, list preview, level controls and one semantic Apply', async () => {
  const { store, sort } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[dataSortPlugin]}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  const trigger = screen.getByRole('button', { name: 'Custom list sort' })
  expect(trigger).toHaveAttribute('data-ribbon-item', 'data.custom-list-sort')
  await act(async () => { fireEvent.click(trigger) })
  const dialog = screen.getByRole('dialog', { name: 'Custom list sort' })
  await act(async () => {
    fireEvent.change(within(dialog).getByLabelText('Sort list 1'), { target: { value: 'host:Priority' } })
    fireEvent.click(within(dialog).getByLabelText('First row is a header'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add level' }))
  })
  expect(within(dialog).getByText('Low → High')).toBeVisible()
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Move sort level 2 up' })) })
  expect(within(dialog).getByLabelText('Sort column 1')).toHaveFocus()
  expect(within(dialog).getByLabelText('Sort list 2')).toHaveValue('host:Priority')
  let finish!: (value: ReturnType<typeof sorted>) => void
  sort.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Apply sort' })) })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(within(dialog).getByLabelText('Sort list 2')).toBeDisabled()
  expect(within(dialog).getByRole('status')).toHaveTextContent('Sorting…')
  await act(async () => { finish(sorted(sort.mock.lastCall![0])) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(sort).toHaveBeenCalledTimes(1)
})

test('localized placeholders and unavailable sources stay readable without silently selecting values', async () => {
  const { store, sort } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[dataSortPlugin]} i18n={createWorkbookI18n('zh')}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '自定义列表排序' })) })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('排序列表 1'), { target: { value: 'host:Priority' } })
  })
  await act(async () => { store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: {} }) })
  expect(screen.getByRole('option', { name: '列表不可用，请重新选择' })).toHaveProperty('selected', true)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '应用排序' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('所选列表已不可用')
  expect(sort).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })) })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('without the plugin the ordinary sort remains and custom-list controls are absent', async () => {
  const { store } = await setup()
  render(<WorkbookStoreProvider store={store}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  expect(screen.getByRole('combobox', { name: 'Sort selected range' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Custom list sort' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})
