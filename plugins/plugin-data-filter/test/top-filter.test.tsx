import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { configureNativeFilterAtom, nativeFilterPanelAtom } from '@einfach-excel/spreadsheet-ui-core'
import { dataFilterPlugin } from '../src'
import { configureTopFilterAtom } from '../src/core'
import { setup } from './filter-fixture'

test('plugin fields edit the shared draft and apply one typed native request', async () => {
  const { store, filter } = await setup([dataFilterPlugin])
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Top / Bottom…' })) })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Rank amount 1'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Rank direction 1'), { target: { value: 'bottom' } })
    fireEvent.change(screen.getByLabelText('Rank unit 1'), { target: { value: 'percent' } })
  })
  expect(filter).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply filter' })) })
  expect(filter).toHaveBeenCalledTimes(1)
  expect(filter.mock.lastCall![0]).toMatchObject({ action: 'apply', rules: [
    { kind: 'top', colIndex: 2, direction: 'bottom', unit: 'percent', value: 25 },
  ] })
})

test('absent or unmounted plugin preserves saved typed rules when another condition changes', async () => {
  const top = { kind: 'top' as const, colIndex: 2, direction: 'top' as const,
    unit: 'items' as const, value: 2 }
  const { store, filter, rerender } = await setup([dataFilterPlugin], [top,
    { kind: 'contains', colIndex: 1, value: 'keep' }])
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  expect(screen.getByLabelText('Rank amount 1')).toHaveValue(2)
  rerender([])
  expect(screen.queryByLabelText('Rank amount 1')).toBeNull()
  expect(screen.getByText(/This saved condition is preserved/)).toBeInTheDocument()
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Filter value 2'), { target: { value: 'kept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }))
  })
  expect(filter.mock.lastCall![0]).toMatchObject({ rules: [top,
    { kind: 'contains', colIndex: 1, value: 'kept', caseSensitive: false }] })
})

test('invalid amount stays editable and Cancel discards the plugin draft', async () => {
  const { store, filter } = await setup([dataFilterPlugin])
  await act(async () => {
    await store.setter(configureNativeFilterAtom, 'open')
    await store.setter(configureTopFilterAtom, { type: 'activate', index: 0 })
    await store.setter(configureTopFilterAtom, { type: 'amount', index: 0, value: '' })
    expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  })
  expect(screen.getByLabelText('Rank amount 1')).toHaveValue(null)
  expect(filter).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
  expect(store.getter(nativeFilterPanelAtom).sheetId).toBeNull()
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  expect(screen.queryByLabelText('Rank amount 1')).toBeNull()
})
