import { createEffect, createSignal, onCleanup, type JSX } from 'solid-js'
import '@einfach/spreadsheet-ui-styles/features/toolbar-shell.css'

interface ToolbarShellProps {
  children: JSX.Element
  class?: string
  'data-filter-sort-error'?: string
  'data-filter-sort-status': string
  'data-testid': string
  'data-toolbar-mutation-error'?: string
  'data-toolbar-mutation-status': string
  onMouseDown: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>
}

/** Scrollable toolbar frame with DOM-only overflow discovery. */
export function ToolbarShell(props: ToolbarShellProps) {
  const [canScrollBack, setCanScrollBack] = createSignal(false)
  const [canScrollForward, setCanScrollForward] = createSignal(false)
  let viewport: HTMLDivElement | undefined

  function updateOverflow() {
    if (!viewport) return
    setCanScrollBack(viewport.scrollLeft > 0)
    setCanScrollForward(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1)
  }

  function scroll(direction: 'back' | 'forward') {
    viewport?.scrollBy({ left: direction === 'back' ? -240 : 240, behavior: 'smooth' })
  }

  createEffect(() => {
    if (!viewport) return
    updateOverflow()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow)
    observer?.observe(viewport)
    viewport.addEventListener('scroll', updateOverflow, { passive: true })
    onCleanup(() => {
      observer?.disconnect()
      viewport?.removeEventListener('scroll', updateOverflow)
    })
  })

  return (
    <div
      class={`spreadsheet-toolbar toolbar-shell ${props.class ?? ''}`.trim()}
      role="toolbar"
      data-testid={props['data-testid']}
      data-filter-sort-status={props['data-filter-sort-status']}
      data-filter-sort-error={props['data-filter-sort-error']}
      data-toolbar-mutation-status={props['data-toolbar-mutation-status']}
      data-toolbar-mutation-error={props['data-toolbar-mutation-error']}
      data-overflowing={canScrollBack() || canScrollForward()}
      onMouseDown={props.onMouseDown}
    >
      <button
        type="button"
        class="toolbar-shell__scroll-button"
        aria-label="Show previous toolbar controls"
        disabled={!canScrollBack()}
        onClick={() => scroll('back')}
      >
        ‹
      </button>
      <div ref={viewport} class="toolbar-shell__viewport" onScroll={updateOverflow}>
        <div class="toolbar-shell__content">{props.children}</div>
      </div>
      <button
        type="button"
        class="toolbar-shell__scroll-button"
        aria-label="Show more toolbar controls"
        disabled={!canScrollForward()}
        onClick={() => scroll('forward')}
      >
        ›
      </button>
    </div>
  )
}
