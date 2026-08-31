import { createEffect, onCleanup, untrack } from 'solid-js'
import {
  connectedElement,
  focusElement,
  getFocusableElements,
} from './focusable-elements'
import type {
  OverlayCloseReason,
  OverlayInteraction,
  OverlayInteractionOptions,
} from './types'

function focusOverlayRoot(root: HTMLElement): () => void {
  const hadTabIndex = root.hasAttribute('tabindex')
  if (!hadTabIndex) root.setAttribute('tabindex', '-1')
  focusElement(root)
  return () => {
    if (!hadTabIndex && root.isConnected) root.removeAttribute('tabindex')
  }
}

function nextFocusTarget(root: HTMLElement, initialFocus?: HTMLElement | null): HTMLElement {
  if (initialFocus && root.contains(initialFocus) && initialFocus.isConnected) return initialFocus
  return getFocusableElements(root)[0] ?? root
}

function trapTabKey(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return
  const focusable = getFocusableElements(root)
  if (focusable.length === 0) {
    event.preventDefault()
    focusOverlayRoot(root)
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const current = document.activeElement
  const outsideOverlay = !(current instanceof Node) || !root.contains(current)
  const shouldWrapForward = !event.shiftKey && (outsideOverlay || current === last)
  const shouldWrapBackward = event.shiftKey && (outsideOverlay || current === first)
  if (!shouldWrapForward && !shouldWrapBackward) return

  event.preventDefault()
  focusElement(event.shiftKey ? last : first)
}

/**
 * Shares DOM interaction mechanics only. Its caller keeps all product state
 * in feature atoms and passes an atom-derived `active` accessor plus a command
 * callback for closure.
 */
export function useOverlayInteraction(options: OverlayInteractionOptions): OverlayInteraction {
  let overlayElement: HTMLElement | null = null

  const isTopmost = () => options.isTopmost?.() ?? true
  const anchorRect = (): DOMRect | null => {
    const anchor = connectedElement(options.anchor?.())
    return anchor?.getBoundingClientRect() ?? null
  }
  const containsTarget = (target: EventTarget | null): boolean => {
    const node = target instanceof Node ? target : null
    if (!node) return false
    return (
      overlayElement?.contains(node) === true ||
      connectedElement(options.anchor?.())?.contains(node) === true
    )
  }
  const requestClose = (reason: OverlayCloseReason) => options.onRequestClose(reason)

  createEffect(() => {
    if (!options.active()) return

    const root = overlayElement
    const returnCandidates = [
      connectedElement(untrack(() => options.anchor?.())),
      connectedElement(document.activeElement as HTMLElement | null),
    ].filter(
      (element, index, values): element is HTMLElement =>
        element !== null && values.indexOf(element) === index,
    )
    let disposed = false
    let restoreRootTabIndex: (() => void) | undefined

    queueMicrotask(() => {
      if (disposed || !isTopmost() || !root?.isConnected) return
      const target = nextFocusTarget(root, untrack(() => options.initialFocus?.()))
      restoreRootTabIndex = target === root ? focusOverlayRoot(root) : undefined
      if (target !== root) focusElement(target)
    })

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (!isTopmost()) return
      if (event.key === 'Escape' && options.closeOnEscape !== false) {
        event.preventDefault()
        event.stopPropagation()
        requestClose('escape')
        return
      }
      if (options.trapFocus !== false && root?.isConnected) trapTabKey(event, root)
    }

    document.addEventListener('keydown', onDocumentKeyDown, true)
    onCleanup(() => {
      disposed = true
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      restoreRootTabIndex?.()
      if (options.restoreFocus === false) return
      queueMicrotask(() => {
        for (const candidate of returnCandidates) {
          if (focusElement(candidate)) return
        }
      })
    })
  })

  return {
    overlayRef: (element) => {
      overlayElement = element
    },
    anchorRect,
    containsTarget,
    requestClose,
  }
}
