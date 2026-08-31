/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { ToolbarAnchoredMenu } from '../src/toolbar/ToolbarAnchoredMenu'
import { ToolbarShell } from '../src/toolbar/ToolbarShell'

afterEach(() => cleanup())

describe('vNext toolbar shell', () => {
  it('makes an overflowing control row reachable without changing toolbar state', async () => {
    const scrollBy = jest.fn()
    const { container } = render(() => (
      <ToolbarShell
        data-testid="toolbar-shell"
        data-filter-sort-status="ready"
        data-toolbar-mutation-status="idle"
        onMouseDown={() => {}}
      >
        <button type="button">First control</button>
        <button type="button">Last control</button>
      </ToolbarShell>
    ))

    const root = container.querySelector('[data-testid="toolbar-shell"]') as HTMLDivElement
    const viewport = container.querySelector('.toolbar-shell__viewport') as HTMLDivElement
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 480 },
    })
    Object.defineProperty(viewport, 'scrollBy', { configurable: true, value: scrollBy })

    fireEvent.scroll(viewport)
    await waitFor(() => expect(root.dataset.overflowing).toBe('true'))
    expect(root.dataset.filterSortStatus).toBe('ready')
    expect(root.dataset.toolbarMutationStatus).toBe('idle')

    const forward = container.querySelector(
      '[aria-label="Show more toolbar controls"]',
    ) as HTMLButtonElement
    expect(forward.disabled).toBe(false)
    fireEvent.click(forward)
    expect(scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 240 })
  })

  it('places anchored menus in the document layer so the toolbar viewport cannot clip them', async () => {
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({ left: 24, bottom: 36 }) as DOMRect
    document.body.append(anchor)

    const { container } = render(() => (
      <ToolbarAnchoredMenu
        anchorRef={anchor}
        class="toolbar-test-menu"
        data-testid="toolbar-test-menu"
        isOpen={true}
        minWidth="120px"
        role="menu"
      >
        <button type="button">Menu command</button>
      </ToolbarAnchoredMenu>
    ))

    const menu = document.body.querySelector('[data-testid="toolbar-test-menu"]') as HTMLDivElement
    await waitFor(() => expect(menu.style.position).toBe('fixed'))
    expect(menu.style.left).toBe('24px')
    expect(menu.style.top).toBe('40px')
    expect(container.contains(menu)).toBe(false)
    anchor.remove()
  })
})
