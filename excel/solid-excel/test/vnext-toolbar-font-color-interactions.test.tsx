/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  selectCellAtom,
  setWorkspaceActiveSheetAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createSignal } from 'solid-js'
import { setLocale } from '../src/i18n'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetToolbar } from '../src/toolbar'
import { FillColorPopover } from '../src/toolbar/FillColorPopover'
import { FontFamilyDropdown } from '../src/toolbar/FontFamilyDropdown'
import { FontSizeDropdown } from '../src/toolbar/FontSizeDropdown'
import { seedReadyVisibleProjection } from './projection-test-fixture'

const ANCHOR_RECT = {
  bottom: 44,
  height: 24,
  left: 20,
  right: 120,
  top: 20,
  width: 100,
  x: 20,
  y: 20,
  toJSON: () => ({}),
} as DOMRect

afterEach(() => {
  cleanup()
  setLocale('en')
})

describe('toolbar font menus', () => {
  it('focuses the current family, navigates the menu, and restores the opener on Escape', async () => {
    const onClose = vi.fn()
    let anchor!: HTMLButtonElement
    const { container } = render(() => (
      <>
        <button ref={anchor} type="button">
          Font family
        </button>
        <FontFamilyDropdown
          open={true}
          anchorRect={ANCHOR_RECT}
          anchorEl={anchor}
          current="Calibri"
          onSelect={() => {}}
          onClose={onClose}
        />
      </>
    ))

    const menu = container.querySelector('[role="menu"]') as HTMLElement
    const current = container.querySelector(
      '[data-testid="toolbar-font-family-item-Calibri"]',
    ) as HTMLButtonElement
    const next = container.querySelector(
      '[data-testid="toolbar-font-family-item-Helvetica"]',
    ) as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(current))
    expect(current.getAttribute('aria-checked')).toBe('true')

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(next)
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="toolbar-font-family-item-Arial"]'),
    )

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(anchor)
  })

  it('focuses the current size and returns focus after selecting a size', async () => {
    const onSelect = vi.fn()
    let anchor!: HTMLButtonElement
    const { container } = render(() => (
      <>
        <button ref={anchor} type="button">
          Font size
        </button>
        <FontSizeDropdown
          open={true}
          anchorRect={ANCHOR_RECT}
          anchorEl={anchor}
          current={18}
          onSelect={onSelect}
          onClose={() => {}}
        />
      </>
    ))

    const current = container.querySelector(
      '[data-testid="toolbar-font-size-item-18"]',
    ) as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(current))
    fireEvent.click(current)
    expect(onSelect).toHaveBeenCalledWith(18)
    expect(document.activeElement).toBe(anchor)
  })
})

describe('toolbar color palette', () => {
  it('reads the active fill and text colors from the Core projection', async () => {
    const store = createStore()
    const backend: SpreadsheetBackend = {
      async readVisibleProjection() {
        throw new Error('not used')
      },
      async readRangeProjection() {
        throw new Error('not used')
      },
      async setCellInput() {
        throw new Error('not used')
      },
    }
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        requestId: 1,
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        cells: [
          {
            row: 0,
            col: 0,
            displayValue: 'A1',
            format: { bgColor: '#ffc000', fgColor: '#c00000' },
          },
        ],
      },
    })

    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetToolbar />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(
      container.querySelector('[data-testid="toolbar-btn-fill-color"]') as HTMLButtonElement,
    )
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-testid="color-popover-swatch-#ffc000"]')
          ?.getAttribute('aria-selected'),
      ).toBe('true'),
    )

    fireEvent.click(
      container.querySelector('[data-testid="toolbar-btn-text-color"]') as HTMLButtonElement,
    )
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-testid="color-popover-swatch-#c00000"]')
          ?.getAttribute('aria-selected'),
      ).toBe('true'),
    )
  })

  it('reflects the current color, supports grid keys, and returns focus on Escape', async () => {
    const onClose = vi.fn()
    const [mode, setMode] = createSignal<'fill' | null>('fill')
    const { container } = render(() => (
      <>
        <button type="button" data-testid="toolbar-btn-fill-color">
          Fill color
        </button>
        <FillColorPopover
          open={mode() !== null}
          mode={mode()}
          currentColor="#ffc000"
          anchorRect={() => ANCHOR_RECT}
          onPick={() => {}}
          onRequestClose={() => {
            onClose()
            setMode(null)
          }}
        />
      </>
    ))

    const current = container.querySelector(
      '[data-testid="color-popover-swatch-#ffc000"]',
    ) as HTMLButtonElement
    const next = container.querySelector(
      '[data-testid="color-popover-swatch-#ffff00"]',
    ) as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(current))
    expect(current.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(current, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(next)
    fireEvent.keyDown(next, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="toolbar-btn-fill-color"]'),
    )
  })

  it('marks no fill as current and restores the opener after a color pick', async () => {
    const onPick = vi.fn()
    const [open, setOpen] = createSignal(true)
    const { container } = render(() => (
      <>
        <button type="button" data-testid="toolbar-btn-text-color">
          Text color
        </button>
        <FillColorPopover
          open={open()}
          mode="text"
          anchorRect={() => ANCHOR_RECT}
          onPick={(hex) => {
            onPick(hex)
            setOpen(false)
          }}
          onRequestClose={() => setOpen(false)}
        />
      </>
    ))

    const automatic = container.querySelector(
      '[data-testid="color-popover-no-fill"]',
    ) as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(automatic))
    expect(automatic.getAttribute('aria-pressed')).toBe('true')

    const black = container.querySelector(
      '[data-testid="color-popover-swatch-#000000"]',
    ) as HTMLButtonElement
    fireEvent.click(black)
    expect(onPick).toHaveBeenCalledWith('#000000')
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="toolbar-btn-text-color"]'),
    )
    expect(container.querySelector('[data-testid="toolbar-color-popover"]')).toBeNull()
  })
})
