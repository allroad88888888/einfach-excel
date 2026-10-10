import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function choose(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
  })
}

test('explicit alignment reads the returned projection and default clears only its own field', async () => {
  const { writes } = await renderFormattingRibbon()
  await choose('Horizontal alignment', 'right')
  expect(screen.getByRole('combobox', { name: 'Horizontal alignment' })).toHaveValue('right')
  await choose('Vertical alignment', 'top')
  expect(screen.getByRole('combobox', { name: 'Vertical alignment' })).toHaveValue('top')
  await choose('Horizontal alignment', 'default')
  await choose('Vertical alignment', 'default')
  expect(writes.map((write) => write.format)).toEqual([
    { align: 'right' }, { verticalAlign: 'top' }, { align: 'default' }, {},
  ])
  expect(writes[3]?.clearFormatFields).toEqual(['verticalAlign'])
})

test('rotation choices send numeric degrees or the explicit vertical mode', async () => {
  const { writes } = await renderFormattingRibbon()
  for (const value of ['-90', '-45', '45', '90', 'vertical', '0']) {
    await choose('Text rotation', value)
    expect(screen.getByRole('combobox', { name: 'Text rotation' })).toHaveValue(value)
  }
  expect(writes.map((write) => write.format)).toEqual([
    { rotation: -90 }, { rotation: -45 }, { rotation: 45 }, { rotation: 90 },
    { rotation: 'vertical' }, { rotation: 0 },
  ])
  expect(screen.queryByRole('alert')).toBeNull()
})
