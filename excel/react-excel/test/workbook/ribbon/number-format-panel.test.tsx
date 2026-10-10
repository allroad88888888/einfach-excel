import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('number decimal places and grouping stay draft-only until Apply, then reopen from projection', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Number format settings')
  expect(screen.getByRole('combobox', { name: 'Number format category' })).toHaveFocus()
  await change('Decimal places', '3')
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Use thousands separator' })) })
  expect(writes).toHaveLength(0)
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({ numberFormat: { kind: 'number', digits: 3, thousands: true } })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Number format settings' })).toHaveFocus()
  await click('Number format settings')
  expect(screen.getByLabelText('Decimal places')).toHaveValue(3)
  expect(screen.getByRole('checkbox')).toBeChecked()
})

test('percentage and currency show only their settings and write native categories', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Number format settings')
  await change('Number format category', 'percent')
  expect(screen.queryByRole('checkbox')).toBeNull()
  await change('Decimal places', '1')
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({ numberFormat: { kind: 'percent', digits: 1 } })
  await click('Number format settings')
  expect(screen.getByLabelText('Number format category')).toHaveValue('percent')
  await change('Number format category', 'currency')
  await change('Currency symbol', '€')
  await click('Apply number format')
  expect(writes[1]?.format).toEqual({ numberFormat: { kind: 'currency', digits: 1, symbol: '€' } })
  await click('Number format settings')
  expect(screen.getByLabelText('Currency symbol')).toHaveValue('€')
})

test('invalid decimal places are correctable without losing the other fields', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Number format settings')
  for (const value of ['', '-1', '1.5', '16']) {
    await change('Decimal places', value)
    await click('Apply number format')
    expect(screen.getByRole('alert')).toHaveTextContent('0 to 15')
  }
  expect(writes).toHaveLength(0)
  await change('Decimal places', '0')
  expect(screen.queryByRole('alert')).toBeNull()
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({ numberFormat: { kind: 'number', digits: 0, thousands: false } })
})

test('Escape and Cancel discard drafts and restore focus without a native write', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Number format settings')
  await change('Decimal places', '5')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Number format settings' })).toHaveFocus()
  await click('Number format settings')
  expect(screen.getByLabelText('Decimal places')).toHaveValue(2)
  await click('Cancel')
  expect(writes).toHaveLength(0)
})

test('scientific precision, fraction denominator and time pattern share one format dialog', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Number format settings')
  await change('Number format category', 'scientific')
  await change('Decimal places', '4')
  expect(screen.queryByRole('checkbox')).toBeNull()
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({ numberFormat: { kind: 'scientific', digits: 4 } })
  await click('Number format settings')
  await change('Number format category', 'fraction')
  expect(screen.queryByLabelText('Decimal places')).toBeNull()
  await change('Denominator', '16')
  await click('Apply number format')
  expect(writes[1]?.format).toEqual({ numberFormat: { kind: 'fraction', denominator: 16 } })
  await click('Number format settings')
  expect(screen.getByLabelText('Denominator')).toHaveValue('16')
  await change('Number format category', 'time')
  expect(screen.queryByLabelText('Denominator')).toBeNull()
  await change('Time format', '[h]:mm:ss')
  await click('Apply number format')
  expect(writes[2]?.format).toEqual({ numberFormat: { kind: 'time', pattern: '[h]:mm:ss' } })
  await click('Number format settings')
  expect(screen.getByLabelText('Time format')).toHaveValue('[h]:mm:ss')
})
