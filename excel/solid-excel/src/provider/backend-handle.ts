import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

export interface SpreadsheetBackendHandle {
  readonly backend: SpreadsheetBackend
  replace(next: SpreadsheetBackend): void
}

/**
 * Keep one context-owned port stable while a Provider binds a replacement
 * workbook. Consumers may retain this port in event handlers; each method
 * access still resolves against the currently bound backend.
 */
export function createSpreadsheetBackendHandle(
  initial: SpreadsheetBackend,
): SpreadsheetBackendHandle {
  let current = initial

  const backend = new Proxy({} as SpreadsheetBackend, {
    get(_target, key) {
      const value = Reflect.get(current, key, current)
      return typeof value === 'function' ? value.bind(current) : value
    },
    has(_target, key) {
      return Reflect.has(current, key)
    },
    ownKeys() {
      return Reflect.ownKeys(current)
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key)
      if (!descriptor) return undefined
      return { ...descriptor, configurable: true }
    },
  })

  return {
    backend,
    replace(next) {
      current = next
    },
  }
}
