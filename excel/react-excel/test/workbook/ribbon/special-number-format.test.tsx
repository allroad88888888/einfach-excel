import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test('Special limits types to the selected locale, previews in Rust and reopens the applied pair', async () => {
  const { writes } = await renderFormattingRibbon(async ({ numberFormat }) => ({
    text: numberFormat.kind === 'special' ? `native ${numberFormat.preset}` : 'original',
  }))
  await click('Number format settings')
  await change('Number format category', 'special')
  expect(screen.queryByLabelText('Decimal places')).toBeNull()
  await change('Special format type', 'phone-us')
  expect(screen.getByRole('status', { name: 'Number format preview' })).toHaveTextContent('native phone-us')
  await change('Locale (location)', 'zh-CN')
  expect(screen.getByLabelText('Special format type')).toHaveValue('postal-code-cn')
  expect(screen.queryByRole('option', { name: 'Phone Number' })).toBeNull()
  expect(writes).toHaveLength(0)
  await click('Apply number format')
  expect(writes[0].format).toEqual({ numberFormat: {
    kind: 'special', preset: 'postal-code-cn', locale: 'zh-CN',
  } })
  await click('Number format settings')
  expect(screen.getByLabelText('Number format category')).toHaveValue('special')
  expect(screen.getByLabelText('Locale (location)')).toHaveValue('zh-CN')
  expect(screen.getByLabelText('Special format type')).toHaveValue('postal-code-cn')
})
