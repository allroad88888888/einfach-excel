import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

test.each(['cell', 'formula-bar'] as const)(
  '%s editing colors reference tokens and renders matching grid range frames',
  async (source) => {
    const controlled = createControlledCellEditingConnection()
    renderSalesOrdersEditingWorksheet(controlled)
    const cell = await firstEditingCell()
    const bar = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })

    if (source === 'cell') {
      fireEvent.doubleClick(cell)
      const editor = screen.getByLabelText<HTMLTextAreaElement>('Cell editor')
      fireEvent.change(editor, { target: { value: '=E2*F2' } })
      expect(editor).toHaveAttribute('data-has-formula-refs', 'true')
      const editorTokens = document.querySelectorAll('.cell-editor .formula-ref-token')
      expect(
        Array.from(editorTokens).map((node) => ({
          text: node.textContent,
          color: node.getAttribute('data-ref-color'),
        })),
      ).toEqual([
        { text: 'E2', color: '0' },
        { text: 'F2', color: '1' },
      ])
    } else {
      act(() => bar.focus())
      fireEvent.input(bar, { target: { value: '=E2*F2' } })
    }

    expect(bar).toHaveAttribute('data-has-formula-refs', 'true')
    const barTokens = document.querySelectorAll('.formula-input-shell .formula-ref-token')
    expect(
      Array.from(barTokens).map((node) => ({
        text: node.textContent,
        color: node.getAttribute('data-ref-color'),
      })),
    ).toEqual([
      { text: 'E2', color: '0' },
      { text: 'F2', color: '1' },
    ])

    const rangeBoxes = document.querySelectorAll<HTMLElement>('.formula-ref-range')
    expect(
      Array.from(rangeBoxes).map((node) => ({
        ref: node.getAttribute('data-formula-ref'),
        color: node.getAttribute('data-ref-color'),
      })),
    ).toEqual([
      { ref: 'E2', color: '0' },
      { ref: 'F2', color: '1' },
    ])

    const activeInput = source === 'cell' ? screen.getByLabelText('Cell editor') : bar
    fireEvent.keyDown(activeInput, { key: 'Escape' })
    expect(document.querySelectorAll('.formula-ref-token')).toHaveLength(0)
    expect(document.querySelectorAll('.formula-ref-range')).toHaveLength(0)
  },
)

test('duplicate references share color and cross-sheet references highlight on target sheet', async () => {
  const controlled = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(controlled)
  await firstEditingCell()
  const bar = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })

  act(() => bar.focus())
  fireEvent.input(bar, { target: { value: "=E2+'Summary'!B1:B2+$E$2+" } })

  const barTokens = document.querySelectorAll('.formula-input-shell .formula-ref-token')
  expect(
    Array.from(barTokens).map((node) => ({
      text: node.textContent,
      color: node.getAttribute('data-ref-color'),
    })),
  ).toEqual([
    { text: 'E2', color: '0' },
    { text: "'Summary'!B1:B2", color: '1' },
    { text: '$E$2', color: '0' },
  ])

  const ordersBoxes = document.querySelectorAll('.formula-ref-range')
  expect(
    Array.from(ordersBoxes).map((node) => ({
      ref: node.getAttribute('data-formula-ref'),
      color: node.getAttribute('data-ref-color'),
    })),
  ).toEqual([{ ref: 'E2', color: '0' }])

  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true'),
  )

  const summaryBoxes = document.querySelectorAll('.formula-ref-range')
  expect(
    Array.from(summaryBoxes).map((node) => ({
      ref: node.getAttribute('data-formula-ref'),
      color: node.getAttribute('data-ref-color'),
    })),
  ).toEqual([{ ref: 'B1:B2', color: '1' }])
})
