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
  const { writes } = await renderFormattingRibbon(async () => ({ text: '29-Feb-24' }))
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
  let release!: (preview: { text: string }) => void
  const preview = vi.fn(() => new Promise<{ text: string }>((resolve) => { release = resolve }))
  const { writes } = await renderFormattingRibbon(preview)
  await click('Number format settings')
  expect(previewBox()).toHaveAttribute('aria-busy', 'true')
  expect(previewBox()).toHaveTextContent('Loading preview')
  await act(async () => { release({ text: '' }) })
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
  await renderFormattingRibbon(async () => ({ text: '<img src=x onerror=alert(1)>' }))
  await click('Number format settings')
  expect(previewBox()).toHaveTextContent('<img src=x onerror=alert(1)>')
  expect(previewBox().querySelector('img')).toBeNull()
})

test('custom category forwards the typed code, maps Rust error codes and colors the preview', async () => {
  type Request = { numberFormat: { kind: string; pattern?: string } }
  const preview = vi.fn(async ({ numberFormat }: Request) =>
    numberFormat.kind !== 'custom' ? { text: '1234.5' }
      : numberFormat.pattern === '0.0.0' ? { invalidCode: 'multiple-decimal-points' as const }
        : { text: '(1,234.50)', color: '#ff0000' })
  const { writes } = await renderFormattingRibbon(preview)
  await click('Number format settings')
  await change('Number format category', 'custom')
  expect(screen.getByLabelText('Format code')).toHaveValue('General')
  await change('Format code', '0.0.0')
  expect(screen.getByRole('alert')).toHaveTextContent('only one decimal point')
  expect(screen.getByLabelText('Format code')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('button', { name: 'Apply number format' })).toBeDisabled()
  expect(previewBox()).toHaveTextContent('Correct the format code')
  await change('Format code', '#,##0.00;[Red](#,##0.00)')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(previewBox()).toHaveTextContent('(1,234.50)')
  expect(previewBox()).toHaveStyle({ color: '#ff0000' })
  await click('Apply number format')
  expect(writes[0]?.format).toEqual({
    numberFormat: { kind: 'custom', pattern: '#,##0.00;[Red](#,##0.00)' },
  })
})

test('custom preview lays out the fill and padding with the grid component', async () => {
  const preview = vi.fn(async () => ({
    text: ' 7', fill: { char: '-', at: 2 }, pads: [{ char: 'W', at: 0 }],
  }))
  await renderFormattingRibbon(preview)
  await click('Number format settings')
  await change('Number format category', 'custom')
  await change('Format code', '_W0*-')
  expect(previewBox().querySelector('.cell-fill-repeat')!.textContent).toMatch(/^-+$/)
  expect(previewBox().querySelector('.cell-pad')).toHaveTextContent('W')
  expect(previewBox().querySelector('.cell-fill-start')).toHaveTextContent('W7')
})
