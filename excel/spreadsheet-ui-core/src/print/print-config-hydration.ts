import { atom, type Getter, type Setter } from '@einfach/core'
import { printConfigStateAtom } from './config-state'
import {
  capturePageSetupReadPort,
  nextPageSetupIdentity,
  snapshotExactPageSetupRead,
  type PrintConfigSource,
} from './page-setup-domain'

export interface HydratePrintConfigInput {
  readonly source: PrintConfigSource
  readonly sheetId: string
}

/** Runtime-only request identities; the engine remains the configuration authority. */
const printConfigHydrationSequenceAtom = atom(0)
printConfigHydrationSequenceAtom.debugLabel = 'spreadsheet.print.hydration.sequence'

/** Retains only the latest in-flight receipt identity for each UI sheet cache entry. */
const printConfigHydrationTicketsAtom = atom<Record<string, number>>({})
printConfigHydrationTicketsAtom.debugLabel = 'spreadsheet.print.hydration.tickets'

function nextHydrationRequestId(get: Getter, set: Setter): number | null {
  const requestId = nextPageSetupIdentity(get(printConfigHydrationSequenceAtom))
  if (requestId !== null) set(printConfigHydrationSequenceAtom, requestId)
  return requestId
}

function ownsHydrationTicket(get: Getter, sheetId: string, requestId: number): boolean {
  return get(printConfigHydrationTicketsAtom)[sheetId] === requestId
}

/**
 * Reads the engine-owned config into the UI cache only after an exactly correlated
 * read receipt. Transport failures and malformed receipts leave the cache intact.
 */
export const hydratePrintConfigAtom = atom(
  null,
  async (get, set, input: HydratePrintConfigInput): Promise<boolean> => {
    if (typeof input.sheetId !== 'string' || input.sheetId.length === 0) return false
    const port = capturePageSetupReadPort(input.source)
    const requestId = nextHydrationRequestId(get, set)
    if (port === null || requestId === null) return false

    set(printConfigHydrationTicketsAtom, (tickets) => ({ ...tickets, [input.sheetId]: requestId }))
    try {
      const result = await port.readPrintConfig.call(port.source, {
        kind: 'read-print-config',
        sheetId: input.sheetId,
        requestId,
      })
      if (!ownsHydrationTicket(get, input.sheetId, requestId)) return false
      const config = snapshotExactPageSetupRead(result, input.sheetId, requestId)
      if (config === null) return false
      set(printConfigStateAtom, (previous) => ({ ...previous, [input.sheetId]: config }))
      return true
    } catch {
      return false
    }
  },
)
hydratePrintConfigAtom.debugLabel = 'spreadsheet.print.hydrate'
