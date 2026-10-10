import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}
const previewBox = () => screen.getByRole('status', { name: 'Number format preview' })

test('date and text categories hide decimals and only Apply writes their format', async () => {
  const { writes } = await renderFormattingRibbon(async () => '29-Feb-24')
  await click('Number format settings')
  await change('Number format category', 'date')
  expect(screen.queryByLabelText('Decimal places')).toBeNull()
  await change('Date style', 'dd-mmm-yy')
  expect(previewBox()).toHaveTextContent('29-Feb-24')
  expect(writes).toHaveLength(0)
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({ numberFormat: { kind: 'date', pattern: 'dd-mmm-yy' } })
  await click('Number format settings')
  expect(screen.getByLabelText('Date style')).toHaveValue('dd-mmm-yy')
  await change('Number format category', 'text')
  expect(screen.queryByLabelText('Date style')).toBeNull()
  expect(screen.queryByLabelText('Decimal places')).toBeNull()
  expect(screen.getByText(/Existing values and formulas are not converted/)).toBeVisible()
  await click('Apply number format')
  expect(writes[1]?.format).toEqual({ numberFormat: { kind: 'text' } })
  expect(screen.getByRole('button', { name: 'Number format settings' })).toHaveFocus()
})

test('pending, empty and failed previews are distinct and cancellation never writes', async () => {
  let release!: (text: string) => void
  const preview = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))
  const { writes } = await renderFormattingRibbon(preview)
  await click('Number format settings')
  expect(previewBox()).toHaveAttribute('aria-busy', 'true')
  expect(previewBox()).toHaveTextContent('Loading preview')
  await act(async () => { release('') })
  expect(previewBox()).toHaveAttribute('aria-busy', 'false')
  expect(previewBox()).toHaveTextContent('(Empty)')
  preview.mockRejectedValueOnce(new Error('offline'))
  await change('Decimal places', '3')
  expect(previewBox()).toHaveTextContent('Preview unavailable')
  await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(writes).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Number format settings' })).toHaveFocus()
})

test('preview is plain text, never HTML from the cell value', async () => {
  await renderFormattingRibbon(async () => '<img src=x onerror=alert(1)>')
  await click('Number format settings')
  expect(previewBox()).toHaveTextContent('<img src=x onerror=alert(1)>')
  expect(previewBox().querySelector('img')).toBeNull()
})
