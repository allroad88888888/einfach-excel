import { atom } from '@einfach/core'

export interface WorkbookBeforeChange {
  readonly command: string
  readonly source: 'user' | 'api' | 'history'
  /** Immutable copy of the native command payload, including its explicit target. */
  readonly payload: unknown
}
export interface WorkbookHooks {
  /** Synchronous: return false to cancel before anything enters the Worker queue. */
  readonly beforeChange?: (event: WorkbookBeforeChange) => boolean | void
}

export const workbookHooksAtom = atom<WorkbookHooks>({})
export const configureWorkbookHooksAtom = atom(null, (_get, set, hooks: WorkbookHooks) => {
  if (!hooks || (hooks.beforeChange !== undefined && typeof hooks.beforeChange !== 'function'))
    throw new Error('Invalid workbook hooks.')
  set(workbookHooksAtom, Object.freeze({ beforeChange: hooks.beforeChange }))
})
configureWorkbookHooksAtom.debugLabel = 'spreadsheet.host.configureHooks'
workbookHooksAtom.debugLabel = 'spreadsheet.host.hooks'

export function immutableCommandPayload(input: unknown): unknown {
  const copy = structuredClone(input)
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  freeze(copy)
  return copy
}
