import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { cellAppearancePlugin } from '../src'
import { renderFormattingRibbon } from '../../../excel/react-excel/test/support/formatting-ribbon-harness'
import { assertUniquePluginIds } from '../../../excel/react-excel/src/plugin/plugin-context'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test('without the optional appearance plugin the shared dialog has only physical positions', async () => {
  await renderFormattingRibbon()
  await click('Border settings')
  expect(screen.getByRole('option', { name: 'Outside borders' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Diagonal down' })).toBeNull()
})

test('the plugin contributes four positions to one existing draft and Apply command', async () => {
  const { writes } = await renderFormattingRibbon(undefined, [cellAppearancePlugin])
  await click('Border settings')
  for (const name of ['Diagonal down', 'Diagonal up', 'Both diagonals', 'No diagonal borders'])
    expect(screen.getByRole('option', { name })).toBeInTheDocument()
  await act(async () => { fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'diagonal' } }) })
  expect(writes).toHaveLength(0)
  await click('Apply borders')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ borderPatch: { preset: 'diagonal', style: 'thin', color: '#000000' } })
  await click('Border settings')
  await act(async () => { fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'diagonal-none' } }) })
  expect(screen.getByLabelText('Line style')).toBeDisabled()
  await click('Cancel')
  expect(writes).toHaveLength(1)
})

test('a host cannot override built-in positions or register conflicting or unknown presets', () => {
  const label = { id: 'test', message: 'Test' }
  expect(() => assertUniquePluginIds([{ id: 'bad', borderPresets: [{ preset: 'all', label }] }]))
    .toThrow('Duplicate border preset: all')
  expect(() => assertUniquePluginIds([cellAppearancePlugin, { ...cellAppearancePlugin, id: 'other' }]))
    .toThrow('Duplicate border preset: diagonal-down')
  expect(() => assertUniquePluginIds([{ id: 'bad', borderPresets: [{ preset: 'unknown' as never, label }] }]))
    .toThrow('Unknown border preset: unknown')
})
