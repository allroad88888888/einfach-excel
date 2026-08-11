/** @jsxImportSource solid-js */

import { atom, createStore } from '@einfach/core'
import { Provider, useAtomValue } from '@einfach/solid'
import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { Show } from 'solid-js'
import {
  useOverlayInteraction,
  type OverlayCloseReason,
  type OverlayInteraction,
} from '../src-vnext/overlay'

const overlayOpenAtom = atom(false)

interface OverlayHarnessProps {
  readonly anchor: () => HTMLElement | null
  readonly closeOnEscape?: boolean
  readonly onInteraction: (interaction: OverlayInteraction) => void
  readonly onRequestClose: (reason: OverlayCloseReason) => void
  readonly trapFocus?: boolean
}

function OverlayHarness(props: OverlayHarnessProps) {
  const active = useAtomValue(overlayOpenAtom)
  const interaction = useOverlayInteraction({
    active,
    anchor: props.anchor,
    closeOnEscape: props.closeOnEscape,
    onRequestClose: props.onRequestClose,
    trapFocus: props.trapFocus,
  })
  props.onInteraction(interaction)

  return (
    <Show when={active()}>
      <section aria-label="Test overlay" data-testid="test-overlay" ref={interaction.overlayRef}>
        <button data-testid="first-overlay-control">First</button>
        <button data-testid="last-overlay-control">Last</button>
      </section>
    </Show>
  )
}

function appendAnchor(): HTMLButtonElement {
  const anchor = document.createElement('button')
  anchor.dataset.overlayTestAnchor = 'true'
  anchor.textContent = 'Open overlay'
  document.body.append(anchor)
  return anchor
}

function renderOverlay(anchor: () => HTMLElement | null, closeOnEscape = true) {
  const store = createStore()
  const closeReasons: OverlayCloseReason[] = []
  let interaction: OverlayInteraction | undefined
  const onRequestClose = (reason: OverlayCloseReason) => {
    closeReasons.push(reason)
    store.setter(overlayOpenAtom, false)
  }

  render(() => (
    <Provider store={store}>
      <OverlayHarness
        anchor={anchor}
        closeOnEscape={closeOnEscape}
        onInteraction={(value) => {
          interaction = value
        }}
        onRequestClose={onRequestClose}
      />
    </Provider>
  ))

  return {
    closeReasons,
    interaction: () => interaction,
    open: () => store.setter(overlayOpenAtom, true),
    store,
  }
}

afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-overlay-test-anchor]').forEach((element) => element.remove())
})

describe('useOverlayInteraction', () => {
  it('closes on Escape and restores focus to the live anchor', async () => {
    const anchor = appendAnchor()
    anchor.focus()
    const overlay = renderOverlay(() => anchor)

    overlay.open()
    const firstControl = await waitFor(() => {
      const element = document.querySelector('[data-testid="first-overlay-control"]')
      if (!(element instanceof HTMLButtonElement)) throw new Error('overlay did not render')
      return element
    })
    await waitFor(() => expect(document.activeElement).toBe(firstControl))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(overlay.closeReasons).toEqual(['escape'])
    await waitFor(() => expect(overlay.store.getter(overlayOpenAtom)).toBe(false))
    await waitFor(() => expect(document.activeElement).toBe(anchor))
  })

  it('traps Tab and Shift+Tab within the overlay controls', async () => {
    const anchor = appendAnchor()
    const overlay = renderOverlay(() => anchor)

    overlay.open()
    const firstControl = await waitFor(() => {
      const element = document.querySelector('[data-testid="first-overlay-control"]')
      if (!(element instanceof HTMLButtonElement)) throw new Error('first control did not render')
      return element
    })
    const lastControl = document.querySelector('[data-testid="last-overlay-control"]')
    expect(lastControl).toBeInstanceOf(HTMLButtonElement)
    const lastButton = lastControl as HTMLButtonElement

    lastButton.focus()
    fireEvent.keyDown(lastButton, { key: 'Tab' })
    expect(document.activeElement).toBe(firstControl)

    firstControl.focus()
    fireEvent.keyDown(firstControl, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastButton)
  })

  it('does not close when Escape has been reserved by the feature', async () => {
    const anchor = appendAnchor()
    const overlay = renderOverlay(() => anchor, false)

    overlay.open()
    await waitFor(() =>
      expect(document.querySelector('[data-testid="test-overlay"]')).not.toBeNull(),
    )
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(overlay.closeReasons).toEqual([])
    expect(overlay.store.getter(overlayOpenAtom)).toBe(true)
  })

  it('reports geometry and containment only while its anchor remains connected', async () => {
    const anchor = appendAnchor()
    const rect = { height: 40, width: 80, x: 10, y: 20 } as DOMRect
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    })
    const overlay = renderOverlay(() => anchor)

    overlay.open()
    const root = await waitFor(() => {
      const element = document.querySelector('[data-testid="test-overlay"]')
      if (!(element instanceof HTMLElement)) throw new Error('overlay did not render')
      return element
    })
    const interaction = overlay.interaction()
    expect(interaction).toBeDefined()
    expect(interaction!.anchorRect()).toBe(rect)
    expect(interaction!.containsTarget(anchor)).toBe(true)
    expect(interaction!.containsTarget(root)).toBe(true)

    anchor.remove()

    expect(interaction!.anchorRect()).toBeNull()
    expect(interaction!.containsTarget(anchor)).toBe(false)
  })
})
