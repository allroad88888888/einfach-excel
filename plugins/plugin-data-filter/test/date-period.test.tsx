import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  configureNativeFilterAtom, filterDatePeriods, type ColumnFilterRule,
} from '@einfach-excel/spreadsheet-ui-core'
import { dataFilterPlugin } from '../src'
import { setup } from './filter-fixture'

test('all date options edit one typed draft and one native request replaces the prior rank', async () => {
  const { store, filter } = await setup([dataFilterPlugin], [
    { kind: 'top', colIndex: 2, direction: 'top', unit: 'items', value: 2 },
  ])
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Date period…' })) })
  expect(screen.queryByLabelText('Rank amount 1')).toBeNull()
  expect(screen.getByLabelText('Date period 1').querySelectorAll('option')).toHaveLength(16)
  for (const value of filterDatePeriods) {
    await act(async () => { fireEvent.change(screen.getByLabelText('Date period 1'), { target: { value } }) })
    expect(filter).not.toHaveBeenCalled()
  }
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply filter' })) })
  expect(filter).toHaveBeenCalledTimes(1)
  expect(filter.mock.lastCall![0]).toMatchObject({ action: 'apply', rules: [
    { kind: 'date-period', colIndex: 2, period: 'year-to-date' },
  ] })
})

test('unmounting the date editor preserves its typed draft and the other column', async () => {
  const date: ColumnFilterRule = { kind: 'date-period', colIndex: 2, period: 'last-quarter' }
  const { store, filter, rerender } = await setup([dataFilterPlugin], [date,
    { kind: 'contains', colIndex: 1, value: 'keep' }])
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  expect(screen.getByLabelText('Date period 1')).toHaveValue('last-quarter')
  await act(async () => { fireEvent.change(screen.getByLabelText('Date period 1'), { target: { value: 'next-year' } }) })
  rerender([])
  expect(screen.queryByLabelText('Date period 1')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply filter' })) })
  expect(filter.mock.lastCall![0]).toMatchObject({ rules: [
    { ...date, period: 'next-year' }, { kind: 'contains', colIndex: 1, value: 'keep' },
  ] })
})

test('Cancel drops a changed period without mutating its saved native rule', async () => {
  const { store, filter } = await setup([dataFilterPlugin], [
    { kind: 'date-period', colIndex: 2, period: 'this-month' },
  ])
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Date period 1'), { target: { value: 'next-month' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  })
  expect(filter).not.toHaveBeenCalled()
  await act(async () => { await store.setter(configureNativeFilterAtom, 'open') })
  expect(screen.getByLabelText('Date period 1')).toHaveValue('this-month')
})
