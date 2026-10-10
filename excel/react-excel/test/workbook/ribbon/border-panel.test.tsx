import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('position, style, palette and custom color are draft-only until Apply', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Border settings')
  expect(screen.getByLabelText('Position')).toHaveFocus()
  await change('Position', 'inside')
  await change('Line style', 'double')
  await click('Border color #c00000')
  expect(screen.getByLabelText('Hex color')).toHaveValue('#c00000')
  await change('Choose custom border color', '#123abc')
  expect(writes).toHaveLength(0)
  await click('Apply borders')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ format: {}, borderPatch: { preset: 'inside', style: 'double', color: '#123abc' } })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Border settings' })).toHaveFocus()
})

test('bad hex stays editable, No borders disables irrelevant controls', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Border settings')
  await change('Hex color', 'url(x)')
  await click('Apply borders')
  expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB')
  expect(writes).toHaveLength(0)
  await change('Hex color', '#123ABC')
  await change('Position', 'none')
  expect(screen.getByLabelText('Line style')).toBeDisabled()
  expect(screen.getByLabelText('Hex color')).toBeDisabled()
  await click('Apply borders')
  expect(writes[0]?.borderPatch).toEqual({ preset: 'none', style: 'thin', color: '#123abc' })
})

test('Escape and Cancel discard changes and restore opener focus', async () => {
  const { writes } = await renderFormattingRibbon()
  await click('Border settings')
  await change('Line style', 'thick')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Border settings' })).toHaveFocus()
  await click('Border settings')
  expect(screen.getByLabelText('Line style')).toHaveValue('thin')
  await click('Cancel')
  expect(writes).toHaveLength(0)
})
