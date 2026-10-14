import { createStore, type Store } from '@einfach/core'
import { onCleanup } from '@einfach/canvas'

/** Plain HTML controls belong only to this demo's shell. */
export function listen(target: EventTarget, type: string, callback: () => void): void {
  target.addEventListener(type, callback)
  onCleanup(() => target.removeEventListener(type, callback))
}

export function element<T extends HTMLElement = HTMLElement>(html: string): T {
  const fragment = document.createElement('template')
  fragment.innerHTML = html.trim()
  return fragment.content.firstElementChild as T
}

export function find<T extends HTMLElement = HTMLElement>(node: ParentNode, selector: string): T {
  const result = node.querySelector<T>(selector)
  if (!result) throw new Error(`Missing demo element: ${selector}`)
  return result
}

export function action(node: ParentNode, name: string, fn: () => void): void {
  listen(find(node, `[data-action="${name}"]`), 'click', fn)
}

/** Measures actual subscriptions; counters are diagnostic bookkeeping, not app state. */
export function observedStore() {
  const original = createStore()
  let subscriptions = 0
  const store: Store = {
    ...original,
    sub(entity, listener) {
      const unsubscribe = original.sub(entity, listener)
      subscriptions++
      let active = true
      return () => {
        if (!active) return
        active = false
        subscriptions--
        unsubscribe()
      }
    },
  }
  return { store, subscriptions: () => subscriptions }
}

export function write(node: ParentNode, name: string, value: string | number): void {
  find(node, `[data-value="${name}"]`).textContent = String(value)
}
