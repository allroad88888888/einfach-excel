import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { setup, click, change } from './fixture'

test('search selection chooses every native match across pages and clears only the changed search', async () => {
  const { filter, values } = await setup()
  await click('Choose values for condition 1')
  expect(screen.getByLabelText('Filter values page')).toHaveTextContent('1–50 of 120')
  await click('Select all search matches')
  expect(values.mock.lastCall![0]).toMatchObject({ allMatches: true, offset: 0 })
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('120 selected')
  await click('Next filter values page')
  expect(screen.getByRole('checkbox', { name: 'Select value Order 051' })).toBeChecked()
  await change('Search filter values', 'Order 00')
  expect(screen.queryByRole('button', { name: 'Select all search matches' })).toBeNull()
  await click('Search')
  expect(screen.getByText('9 search matches')).toBeVisible()
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('120 selected')
  await click('Clear all search matches')
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('111 selected')
  expect(screen.getByRole('checkbox', { name: 'Select value Order 001' })).not.toBeChecked()
  expect(filter).not.toHaveBeenCalled()
  await click('Apply filter')
  expect(filter).toHaveBeenCalledTimes(1)
  const input = filter.mock.lastCall![0]
  expect(input.action === 'apply' && input.rules[0].kind === 'list' && input.rules[0].values.length).toBe(111)
})

test('complete-match budget rejection keeps selected choices and allows a narrower retry', async () => {
  const { filter, values } = await setup()
  await click('Choose values for condition 1'); await click('Select page')
  values.mockRejectedValueOnce(new Error('All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search.'))
  await click('Select all search matches')
  expect(screen.getByRole('alert')).toHaveTextContent('1,000-value')
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('50 selected')
  expect(screen.getByRole('checkbox', { name: 'Select value Order 001' })).toBeChecked()
  await change('Search filter values', 'Order 120'); await click('Search'); await click('Select all search matches')
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('51 selected')
  expect(filter).not.toHaveBeenCalled()
  await click('Cancel')
})
