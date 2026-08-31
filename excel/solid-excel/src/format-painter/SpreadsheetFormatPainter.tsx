/** @jsxImportSource solid-js */

import { onCleanup } from 'solid-js'
import type { Store } from '@einfach/core'
import { useAtomValue } from '@einfach/solid'
import {
  applyFormatPainterAtom,
  captureFormatPainterBackendCapabilitiesAtom,
  exitFormatPainterAtom,
  formatPainterPendingAtom,
  formatPainterStateAtom,
  resolveContentMutationAtom,
  selectionAuthorityWitnessAtom,
  syncFormatPainterContextAtom,
  workspaceActiveSheetAuthorityWitnessAtom,
  type ApplyFormatPainterInput,
  type CellRange,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection, useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'

export interface SpreadsheetFormatPainterProps {
  'data-testid'?: string
}

interface MountedFormatPainterHost {
  mountCount: number
  dispose(): void
}

const mountedHosts = new WeakMap<Store, MountedFormatPainterHost>()

/**
 * Attach one provider-scoped host to the Core-owned format-painter state
 * machine. A workbook can render several grids (and keep the old explicit
 * host in place) without duplicating the mutation subscription.
 *
 * This owns host resources only: backend ports plus window/listener cleanup.
 * Session identity, source/target suppression, tickets, pending/error state,
 * acknowledgement validation, and the attempt ledger stay in UI-core atoms.
 */
function retainFormatPainterHost(store: Store, backend: SpreadsheetBackend): () => void {
  const mounted = mountedHosts.get(store)
  if (mounted) {
    mounted.mountCount += 1
    return () => releaseFormatPainterHost(store, mounted)
  }

  // Capture the provider surface exactly once. All later mutation and refresh
  // calls use these receiver-preserving Core snapshots, never a live re-read.
  const capabilities = store.setter(captureFormatPainterBackendCapabilitiesAtom, backend)
  const projectionBackend = Object.freeze({
    readVisibleProjection: capabilities.readVisibleProjection,
  }) as SpreadsheetBackend
  const applyPorts: ApplyFormatPainterInput = Object.freeze({
    // Mutation gateway: remap display rows to source rows and enforce the
    // protection gate (locked cells on a protected sheet cannot be painted).
    // A blocked resolution returns [] — Core's W0 single-contiguous-target
    // preflight then fails before any transport; the gateway has already
    // recorded the structured diagnostic + lastBlock.
    resolveTargetRanges: Object.freeze((sheetId: string, range: CellRange): CellRange[] => {
      const resolution = store.setter(resolveContentMutationAtom, {
        kind: 'set-format-range',
        sheetId,
        range,
      })
      if (resolution.status === 'blocked') return []
      return (resolution.ranges ?? [range]).map((sourceRange) => ({ ...sourceRange }))
    }),
    setFormatRange: capabilities.setFormatRange,
    refreshProjection:
      capabilities.readVisibleProjection === undefined
        ? undefined
        : Object.freeze((sheetId: string) =>
            refreshVisibleProjection(store, projectionBackend, sheetId, 'toolbar'),
          ),
  })

  function tryApply(): void {
    // Core reads the logical target and decides whether this is source,
    // duplicate, pending, blocked, stale, or a new immutable mutation ticket.
    void store.setter(applyFormatPainterAtom, applyPorts)
  }

  const unsubscribeSelection = store.sub(selectionAuthorityWitnessAtom, tryApply)
  const unsubscribePending = store.sub(formatPainterPendingAtom, () => {
    // If selection drifted while a mutation/refresh was pending, the selection
    // callback was correctly blocked. Retry from Core authority once clear.
    if (!store.getter(formatPainterPendingAtom)) tryApply()
  })
  const unsubscribeWorkspace = store.sub(workspaceActiveSheetAuthorityWitnessAtom, () => {
    store.setter(syncFormatPainterContextAtom)
  })

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && store.getter(formatPainterStateAtom) !== 'idle') {
      store.setter(exitFormatPainterAtom)
    }
  }

  if (typeof window !== 'undefined') window.addEventListener('keydown', handleKeyDown)

  const host: MountedFormatPainterHost = {
    mountCount: 1,
    dispose: () => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKeyDown)
      unsubscribeSelection()
      unsubscribePending()
      unsubscribeWorkspace()
    },
  }
  mountedHosts.set(store, host)
  return () => releaseFormatPainterHost(store, host)
}

function releaseFormatPainterHost(store: Store, host: MountedFormatPainterHost): void {
  if (mountedHosts.get(store) !== host) return
  host.mountCount -= 1
  if (host.mountCount > 0) return
  mountedHosts.delete(store)
  host.dispose()
}

/**
 * Thin Solid mount for the Core-owned format-painter state machine.
 *
 * `SpreadsheetGrid` now mounts this automatically. Keeping the public host
 * makes older compositions safe while the provider-scoped lease prevents a
 * second grid from adding duplicate mutation listeners.
 */
export function SpreadsheetFormatPainter(props: SpreadsheetFormatPainterProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const releaseHost = retainFormatPainterHost(store, backend)

  onCleanup(releaseHost)

  const painterStateSignal = useAtomValue(formatPainterStateAtom)

  return (
    <span
      aria-hidden="true"
      style={{ display: 'none' }}
      data-testid={props['data-testid'] ?? 'spreadsheet-format-painter'}
      data-format-painter-state={painterStateSignal()}
    />
  )
}
