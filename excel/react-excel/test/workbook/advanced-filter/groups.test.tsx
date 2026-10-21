import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { setup, click, change } from './fixture'

test('OR groups expose AND conditions, editing and removal before one native Apply', async () => {
  const { filter, open } = await setup()
  await change('Filter value 1', 'West')
  await click('Add OR group')
  await change('Filter column 2', '1'); await change('Filter value 2', 'East')
  await click('Add condition')
  await change('Filter condition 3', 'range')
  await change('Minimum 3', '15')
  expect(screen.getByRole('group', { name: 'Filter group 1' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Filter group 2' })).toBeVisible()
  expect(filter).not.toHaveBeenCalled()
  await click('Remove condition 3')
  await click('Add condition to group 2')
  await change('Filter value 3', '30')
  await click('Apply filter')
  expect(filter).toHaveBeenCalledTimes(1)
  expect(filter.mock.lastCall![0]).toMatchObject({ rules: [], groups: [
    { rules: [{ kind: 'equals', colIndex: 0, value: 'West' }] },
    { rules: [{ kind: 'equals', colIndex: 1, value: 'East' }, { kind: 'equals', colIndex: 2, value: '30' }] },
  ] })
  expect(screen.getByRole('combobox', { name: 'Worksheet filter' })).toHaveFocus()
  await open()
  expect(screen.getByLabelText('Filter value 3')).toHaveValue('30')
  await click('Remove group 1')
  expect(screen.queryByRole('group', { name: 'Filter group 2' })).toBeNull()
  expect(screen.getByLabelText('Filter value 1')).toHaveValue('East')
  expect(screen.getByRole('button', { name: 'Remove group 1' })).toBeDisabled()
  await click('Cancel')
  expect(filter).toHaveBeenCalledTimes(1)
})

test('native rejection retains all group fields for correction and cancel returns focus', async () => {
  const { filter } = await setup()
  await click('Add OR group'); await change('Filter value 2', 'East')
  filter.mockRejectedValueOnce(new Error('Native scan budget exceeded'))
  await click('Apply filter')
  expect(screen.getByRole('dialog')).toHaveTextContent('Native scan budget exceeded')
  expect(screen.getByLabelText('Filter value 2')).toHaveValue('East')
  await click('Remove group 2'); await change('Filter value 1', 'West')
  await click('Apply filter')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(filter).toHaveBeenCalledTimes(2)
})
