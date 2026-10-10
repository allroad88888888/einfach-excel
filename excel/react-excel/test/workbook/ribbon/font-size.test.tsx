import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function open() {
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox', { name: 'Font size' }), { target: { value: 'custom' } })
  })
}
async function draft(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Custom font size' }), { target: { value } })
  })
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test('custom size is draft-only until Apply and non-preset projection remains selectable', async () => {
  const { writes } = await renderFormattingRibbon()
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveValue('12')
  await open()
  expect(screen.getByRole('spinbutton', { name: 'Custom font size' })).toHaveValue(12)
  await draft('23')
  expect(writes).toHaveLength(0)
  await click('Apply font size')
  expect(writes.map((write) => write.format)).toEqual([{ fontSize: 23 }])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveValue('23')
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveFocus()
  await click('Increase font size')
  await click('Decrease font size')
  expect(writes.map((write) => write.format)).toEqual([
    { fontSize: 23 }, { fontSize: 24 }, { fontSize: 22 },
  ])
})

test('invalid sizes show a correctable error without writing', async () => {
  const { writes } = await renderFormattingRibbon()
  await open()
  for (const value of ['', '0', '12.5', '513']) {
    await draft(value)
    await click('Apply font size')
    expect(screen.getByRole('alert')).toHaveTextContent('whole-number')
    expect(screen.getByRole('spinbutton', { name: 'Custom font size' }))
      .toHaveAttribute('aria-invalid', 'true')
  }
  expect(writes).toHaveLength(0)
  await draft('13')
  await click('Apply font size')
  expect(writes[0]?.format).toEqual({ fontSize: 13 })
})

test('Escape and Cancel discard the draft and restore the size control', async () => {
  const { writes } = await renderFormattingRibbon()
  await open()
  await draft('23')
  await act(async () => {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveFocus()
  await open()
  expect(screen.getByRole('spinbutton', { name: 'Custom font size' })).toHaveValue(12)
  await click('Cancel')
  expect(writes).toHaveLength(0)
})

test('minimum and maximum sizes disable only the matching step', async () => {
  await renderFormattingRibbon()
  await open()
  await draft('1')
  await click('Apply font size')
  expect(screen.getByRole('button', { name: 'Decrease font size' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Increase font size' })).toBeEnabled()
  await open()
  await draft('512')
  await click('Apply font size')
  expect(screen.getByRole('button', { name: 'Increase font size' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Decrease font size' })).toBeEnabled()
})
