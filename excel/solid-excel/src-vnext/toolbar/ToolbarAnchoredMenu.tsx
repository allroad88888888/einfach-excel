import { createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'

interface ToolbarAnchoredMenuProps {
  anchorRef?: HTMLElement | null
  children: JSX.Element
  class: string
  'data-testid': string
  isOpen: boolean
  minWidth: string
  rootRef?: (element: HTMLDivElement) => void
  role: 'menu'
}

/**
 * Renders an existing toolbar menu beside its trigger in a document portal.
 *
 * The scrollable toolbar viewport must not become an overflow ancestor for
 * menus: CSS then clips every absolutely-positioned descendant. This wrapper
 * owns only DOM positioning and lifecycle listeners; the menu's open/close
 * state remains in the existing Core toolbar surface atom.
 */
export function ToolbarAnchoredMenu(props: ToolbarAnchoredMenuProps) {
  const [position, setPosition] = createSignal({ left: '0px', top: '0px' })
  let menuRef: HTMLDivElement | undefined

  function updatePosition() {
    const anchor = props.anchorRef
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 8))}px`,
      top: `${Math.max(8, rect.bottom + 4)}px`,
    })
  }

  createEffect(() => {
    if (!props.isOpen) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    if (props.anchorRef) observer?.observe(props.anchorRef)
    if (menuRef) observer?.observe(menuRef)
    onCleanup(() => {
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
      observer?.disconnect()
    })
  })

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div
          ref={(element) => {
            menuRef = element
            props.rootRef?.(element)
          }}
          class={props.class}
          role={props.role}
          data-testid={props['data-testid']}
          style={{
            position: 'fixed',
            left: position().left,
            top: position().top,
            'z-index': 30,
            'min-width': props.minWidth,
            background: '#fff',
            border: '1px solid #d0d0d0',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.12)',
            display: 'flex',
            'flex-direction': 'column',
            padding: '4px 0',
          }}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  )
}
