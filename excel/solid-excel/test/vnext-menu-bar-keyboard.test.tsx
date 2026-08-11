/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { topMenuOpenAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { SpreadsheetMenuBar } from '../src-vnext/menu-bar'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

function createBackend(): SpreadsheetBackend {
  return {
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
}

function renderMenuBar() {
  const store = createStore()
  const rendered = render(() => (
    <SpreadsheetUiProvider backend={createBackend()} store={store}>
      <SpreadsheetMenuBar />
    </SpreadsheetUiProvider>
  ))
  return { ...rendered, store }
}

describe('SpreadsheetMenuBar keyboard navigation', () => {
  it('opens from a top-level button and moves its focused menu-item highlight', async () => {
    const { container, store } = renderMenuBar()
    const editButton = container.querySelector(
      '[data-testid="menu-bar-button-edit"]',
    ) as HTMLButtonElement

    editButton.focus()
    fireEvent.keyDown(editButton, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(store.getter(topMenuOpenAtom)).toEqual({ kind: 'open', menu: 'edit' })
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-item-edit.undo"]'),
      )
    })

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="menu-bar-item-edit.redo"]'),
    )

    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    await waitFor(() => {
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-item-edit.selectAll"]'),
      )
    })
  })

  it('switches menus with horizontal arrows and restores the triggering top button on Escape', async () => {
    const { container, store } = renderMenuBar()
    const editButton = container.querySelector(
      '[data-testid="menu-bar-button-edit"]',
    ) as HTMLButtonElement

    editButton.focus()
    fireEvent.keyDown(editButton, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-item-edit.undo"]'),
      ),
    )

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(store.getter(topMenuOpenAtom)).toEqual({ kind: 'open', menu: 'insert' })
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-item-insert.sheet"]'),
      )
    })

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => {
      expect(store.getter(topMenuOpenAtom)).toEqual({ kind: 'idle' })
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-button-insert"]'),
      )
    })
  })

  it('uses Alt access keys to open a menu and focus its first available item', async () => {
    const { container, store } = renderMenuBar()

    fireEvent.keyDown(document, { key: 'f', altKey: true })

    await waitFor(() => {
      expect(store.getter(topMenuOpenAtom)).toEqual({ kind: 'open', menu: 'file' })
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="menu-bar-item-file.printPreview"]'),
      )
    })
  })
})
