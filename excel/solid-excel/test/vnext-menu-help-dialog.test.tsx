/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { MenuBarHelpDialog } from '../src/menu-bar/menu-bar-help-dialog'

afterEach(cleanup)

describe('MenuBarHelpDialog Office web shell', () => {
  it('keeps the closed state unmounted and renders the compact shortcuts card', () => {
    const closed = render(() => <MenuBarHelpDialog kind="closed" onClose={jest.fn()} />)
    expect(closed.container.querySelector('[role="dialog"]')).toBeNull()
    closed.unmount()

    const rendered = render(() => <MenuBarHelpDialog kind="shortcuts" onClose={jest.fn()} />)
    const dialog = rendered.getByRole('dialog')

    expect(dialog.querySelector('header')).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBe('spreadsheet-help-overlay-content')
    expect(rendered.getByTestId('spreadsheet-help-overlay-shortcut-list')).not.toBeNull()
    expect(
      rendered.getByTestId('spreadsheet-help-overlay-close').getAttribute('data-variant'),
    ).toBe('primary')
  })

  it('closes from the primary action or Escape without changing the caller contract', () => {
    const onClose = jest.fn()
    const { getByRole } = render(() => <MenuBarHelpDialog kind="about" onClose={onClose} />)
    const dialog = getByRole('dialog')

    fireEvent.click(getByRole('button'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps the feature skin token-only for light and dark themes', () => {
    const source = readFileSync(
      join(process.cwd(), 'excel/spreadsheet-ui-styles/features/menu-help-dialog.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
    expect(source).toContain('var(--bg-surface)')
    expect(source).toContain('var(--dialog-primary-hover)')
  })
})
