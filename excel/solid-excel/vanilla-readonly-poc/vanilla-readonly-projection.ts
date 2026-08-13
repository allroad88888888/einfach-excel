// 一句话：把 UI Core 的只读可见投影快照渲染到原生 DOM。

import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  projectionSnapshotAtom,
  rejectProjectionAtom,
  resolveProjectionAtom,
  type CellRange,
  type ProjectionSnapshot,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'

type VisibleProjectionReader = Pick<SpreadsheetBackend, 'readVisibleProjection'>

export interface VanillaReadonlyProjectionOptions {
  readonly backend: VisibleProjectionReader
  readonly host: HTMLElement
  readonly initialWindow: CellRange
  readonly sheetId: string
  readonly store: Store
}

export interface VanillaReadonlyProjectionSession {
  readonly dispose: () => void
  readonly refresh: (window?: CellRange) => Promise<void>
}

function visibleResultFrom(snapshot: ProjectionSnapshot) {
  return snapshot.result?.kind === 'visible-window' ? snapshot.result : undefined
}

function renderProjectionSnapshot(host: HTMLElement, snapshot: ProjectionSnapshot): void {
  const content = document.createDocumentFragment()
  const status = document.createElement('output')
  status.setAttribute('aria-live', 'polite')
  status.textContent = `Projection ${snapshot.status}.`
  content.append(status)

  const result = visibleResultFrom(snapshot)
  if (result) {
    const grid = document.createElement('div')
    grid.setAttribute('aria-label', 'Spreadsheet projection')
    grid.setAttribute('role', 'grid')

    for (const cell of result.cells) {
      const element = document.createElement('div')
      element.dataset.col = String(cell.col)
      element.dataset.row = String(cell.row)
      element.setAttribute('role', 'gridcell')
      element.textContent = cell.displayValue
      grid.append(element)
    }

    content.append(grid)
  }

  host.dataset.projectionStatus = snapshot.status
  host.replaceChildren(content)
}

async function runVisibleProjectionTransport(
  store: Store,
  backend: VisibleProjectionReader,
  initialRequest: VisibleProjectionRequest,
): Promise<void> {
  let request = initialRequest

  while (true) {
    try {
      const result = await backend.readVisibleProjection(request)
      const outcome = store.setter(resolveProjectionAtom, { request, result })
      if (outcome.nextRequest) {
        request = outcome.nextRequest
        continue
      }
      return
    } catch (error) {
      const outcome = store.setter(rejectProjectionAtom, { request, error })
      if (outcome.status === 'rejected' && outcome.nextRequest) {
        request = outcome.nextRequest
        continue
      }
      throw error
    }
  }
}

/**
 * Mounts a bounded, read-only visible-window session. The only display source
 * is `projectionSnapshotAtom`; backend results first settle through UI Core.
 */
export function mountVanillaReadonlyProjection(
  options: VanillaReadonlyProjectionOptions,
): VanillaReadonlyProjectionSession {
  let disposed = false
  const render = () => {
    if (!disposed)
      renderProjectionSnapshot(options.host, options.store.getter(projectionSnapshotAtom))
  }
  const unsubscribe = options.store.sub(projectionSnapshotAtom, render)
  render()

  return Object.freeze({
    async refresh(window = options.initialWindow): Promise<void> {
      if (disposed) throw new Error('The read-only projection session is disposed.')

      const begin = options.store.setter(beginProjectionAtom, {
        kind: 'visible-window',
        sheetId: options.sheetId,
        window,
        reason: 'viewport',
        retainResult: true,
      })
      if (begin.status !== 'started' || begin.request.kind !== 'visible-window') return

      await runVisibleProjectionTransport(options.store, options.backend, begin.request)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      unsubscribe()
      options.host.replaceChildren()
    },
  })
}
