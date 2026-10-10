import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test('presets write one color and closing restores the arrow trigger focus', async () => {
  const { writes } = await renderFormattingRibbon()
  const trigger = screen.getByRole('button', { name: 'Choose fill color' })
  await click('Choose fill color')
  expect(screen.getByRole('dialog', { name: 'Fill color' })).toBeTruthy()
  await click('Color #93c47d')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toHaveLength(1)
  expect(writes[0]?.format).toEqual({ bgColor: '#93c47d' })
  expect(document.activeElement).toBe(trigger)
  await click('Choose fill color')
  expect(screen.getByRole('button', { name: 'Color #93c47d' }).getAttribute('aria-pressed'))
    .toBe('true')
  await click('Close color palette')
  expect(writes).toHaveLength(1)
})

test('Hex typing only changes the draft; Apply validates then writes the normalized color', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Choose text color')
  const hex = screen.getByRole('textbox', { name: 'Color hex' })
  await act(async () => { fireEvent.change(hex, { target: { value: '#xyz123' } }) })
  expect(writes).toHaveLength(0)
  await click('Apply')
  expect(screen.getByRole('alert').textContent).toContain('six-digit')
  expect(hex.getAttribute('aria-invalid')).toBe('true')
  await act(async () => { fireEvent.change(hex, { target: { value: '#ABCDEF' } }) })
  await click('Apply')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toHaveLength(1)
  expect(writes[0]?.format).toEqual({ fgColor: '#abcdef' })
})

test('the native picker is draft-only and reset clears only its own field', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Choose fill color')
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Custom color picker'), { target: { value: '#123456' } })
  })
  expect((screen.getByRole('textbox', { name: 'Color hex' }) as HTMLInputElement).value)
    .toBe('#123456')
  expect(writes).toHaveLength(0)
  await click('No fill')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes[0]).toMatchObject({ format: {}, clearFormatFields: ['bgColor'] })
  await click('Choose text color')
  await click('Automatic text color')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes[1]).toMatchObject({ format: {}, clearFormatFields: ['fgColor'] })
})

test('native Escape cancellation dismisses without writing', async () => {
  const { writes } = await renderFormattingRibbon()
  const trigger = screen.getByRole('button', { name: 'Choose text color' })
  await click('Choose text color')
  await act(async () => {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(writes).toHaveLength(0)
  expect(document.activeElement).toBe(trigger)
})
