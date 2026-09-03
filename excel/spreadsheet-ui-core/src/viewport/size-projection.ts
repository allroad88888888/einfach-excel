import { atom, type Getter } from '@einfach/core'
import type {
  ProjectionRequestId,
  ViewportSizeProjectionRequest,
  ViewportSizeProjectionResult,
} from '../backend/types'
import type { CellRange } from '../shared'
import {
  rotateViewportMetadataProjectionIdentity,
  viewportMetadataProjectionIdentityAtom,
  viewportSizeOverridesAtom,
} from './size-overrides'
import {
  matchingCanonicalViewportSizes,
  reconcileColumnWidthWindow,
  reconcileRowHeightWindow,
  snapshotSizeWindow,
} from './size-projection-validation'
import type { ViewportSizeOverrideState } from './types'

/** Framework-neutral transport for windowed row-height and column-width hydration. */
export interface ViewportSizeProjectionPort {
  readViewportSizeProjection?: (
    request: ViewportSizeProjectionRequest,
  ) => Promise<ViewportSizeProjectionResult>
}

export interface HydrateViewportSizeProjectionInput {
  readonly source: ViewportSizeProjectionPort
  readonly sheetId: string
  readonly window: Readonly<CellRange>
}

export type ViewportSizeHydrationOutcome = 'ready' | 'blocked' | 'unsupported' | 'stale'

type ViewportSizeHydrationTicket = Readonly<{
  source: ViewportSizeProjectionPort
  sheetId: string
  window: Readonly<CellRange>
  requestId: ProjectionRequestId
  metadataIdentity: Readonly<object>
}>

const activeViewportSizeTicketAtom = atom<ViewportSizeHydrationTicket | null>(null)
activeViewportSizeTicketAtom.debugLabel = 'spreadsheet.viewport.sizeActiveTicket'

const viewportSizeRequestSequenceAtom = atom<ProjectionRequestId>(0)
viewportSizeRequestSequenceAtom.debugLabel = 'spreadsheet.viewport.sizeRequestSequence'

function nextViewportSizeRequestId(sequence: ProjectionRequestId): ProjectionRequestId | null {
  return Number.isSafeInteger(sequence) && sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : null
}

function viewportSizeTicketIsCurrent(get: Getter, ticket: ViewportSizeHydrationTicket): boolean {
  return get(activeViewportSizeTicketAtom) === ticket
}

/**
 * Hydrates one exact row-height and column-width window from the backend.
 * Both slices are validated before one synchronous cache update.
 */
export const hydrateViewportSizeProjectionAtom = atom(
  null,
  async (
    get,
    set,
    input: HydrateViewportSizeProjectionInput,
  ): Promise<ViewportSizeHydrationOutcome> => {
    const window = snapshotSizeWindow(input.window)
    if (!input.sheetId || !window) return 'blocked'

    const read = input.source.readViewportSizeProjection
    if (!read) return 'unsupported'

    const requestId = nextViewportSizeRequestId(get(viewportSizeRequestSequenceAtom))
    if (requestId === null) return 'blocked'
    const ticket: ViewportSizeHydrationTicket = Object.freeze({
      source: input.source,
      sheetId: input.sheetId,
      window,
      requestId,
      metadataIdentity: get(viewportMetadataProjectionIdentityAtom),
    })
    set(viewportSizeRequestSequenceAtom, requestId)
    set(activeViewportSizeTicketAtom, ticket)

    let result: unknown
    try {
      result = await read({
        kind: 'viewport-size',
        sheetId: ticket.sheetId,
        window: ticket.window,
        requestId: ticket.requestId,
      } satisfies ViewportSizeProjectionRequest)
    } catch {
      if (!viewportSizeTicketIsCurrent(get, ticket)) return 'stale'
      set(activeViewportSizeTicketAtom, null)
      return 'blocked'
    }
    if (!viewportSizeTicketIsCurrent(get, ticket)) return 'stale'

    const canonical = matchingCanonicalViewportSizes(result, ticket)
    if (!canonical) {
      set(activeViewportSizeTicketAtom, null)
      return 'blocked'
    }
    if (get(viewportMetadataProjectionIdentityAtom) !== ticket.metadataIdentity) {
      set(activeViewportSizeTicketAtom, null)
      return 'stale'
    }

    const sizeState = get(viewportSizeOverridesAtom)
    const nextSizeState: ViewportSizeOverrideState = {
      rowHeightsBySheet: {
        ...sizeState.rowHeightsBySheet,
        [ticket.sheetId]: reconcileRowHeightWindow(
          sizeState.rowHeightsBySheet[ticket.sheetId] ?? {},
          canonical.rowHeights,
          ticket.window.rowStart,
          ticket.window.rowEnd,
        ),
      },
      colWidthsBySheet: {
        ...sizeState.colWidthsBySheet,
        [ticket.sheetId]: reconcileColumnWidthWindow(
          sizeState.colWidthsBySheet[ticket.sheetId] ?? {},
          canonical.colWidths,
          ticket.window.colStart,
          ticket.window.colEnd,
        ),
      },
    }

    set(viewportSizeOverridesAtom, nextSizeState)
    rotateViewportMetadataProjectionIdentity(set)
    set(activeViewportSizeTicketAtom, null)
    return 'ready'
  },
)
hydrateViewportSizeProjectionAtom.debugLabel = 'spreadsheet.viewport.hydrateSizeProjection'
