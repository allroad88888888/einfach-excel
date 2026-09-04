/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@solidjs/testing-library'
import { FillColorPopover } from '../src/toolbar/FillColorPopover'

const ANCHOR_RECT = {
  bottom: 44,
  height: 28,
  left: 20,
  right: 48,
  top: 16,
  width: 28,
  x: 20,
  y: 16,
  toJSON: () => ({}),
} as DOMRect

afterEach(cleanup)

describe('FillColorPopover Office web surface', () => {
  it('stays an anchored non-modal dialog with the current color selected', () => {
    const { getByRole, getByTestId } = render(() => (
      <FillColorPopover
        open={true}
        mode="fill"
        currentColor="#ffc000"
        anchorRect={() => ANCHOR_RECT}
        onPick={() => {}}
        onRequestClose={() => {}}
      />
    ))

    expect(getByRole('dialog').getAttribute('aria-modal')).toBe('false')
    expect(getByTestId('toolbar-color-popover').style.position).toBe('fixed')
    expect(getByTestId('color-popover-swatch-#ffc000').getAttribute('data-selected')).toBe('true')
  })

  it('uses token-only Office Web palette states without modal selectors', () => {
    const source = readFileSync(
      join(process.cwd(), 'excel/spreadsheet-ui-styles/styles/toolbar-popovers.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')
    const colorPopoverSource = source.slice(source.indexOf('.spreadsheet-color-popover'))

    expect(colorPopoverSource.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
    expect(colorPopoverSource).toContain('var(--control-h)')
    expect(colorPopoverSource).toContain('var(--office-blue)')
    expect(colorPopoverSource).toContain('var(--excel-green)')
    expect(colorPopoverSource).not.toContain('[role=')
  })
})
