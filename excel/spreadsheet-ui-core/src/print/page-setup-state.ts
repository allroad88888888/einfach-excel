import { atom, type Atom } from '@einfach/core'
import type { PrintConfig } from './types'

export type PageSetupPhase =
  | 'editing'
  | 'saving'
  | 'refreshing'
  | 'blocked'
  | 'outcome-unknown'
  | 'refresh-failed'

/** A single Atom-owned editing session; no framework component owns this state. */
export interface PageSetupSession {
  readonly sessionId: number
  readonly sheetId: string
  readonly draft: PrintConfig
  readonly phase: PageSetupPhase
  readonly error: string
  readonly mutationRequestId: number | null
  readonly refreshRequestId: number | null
}

const pageSetupSessionStateAtom = atom<PageSetupSession | null>(null)
const pageSetupSessionSequenceAtom = atom(0)
const pageSetupRequestSequenceAtom = atom(0)

pageSetupSessionStateAtom.debugLabel = 'spreadsheet.print.pageSetup.session.state'
pageSetupSessionSequenceAtom.debugLabel = 'spreadsheet.print.pageSetup.sessionSequence.state'
pageSetupRequestSequenceAtom.debugLabel = 'spreadsheet.print.pageSetup.requestSequence.state'

export const pageSetupSessionAtom: Atom<PageSetupSession | null> = atom((get) =>
  get(pageSetupSessionStateAtom),
)
pageSetupSessionAtom.debugLabel = 'spreadsheet.print.pageSetup.session'

export const pageSetupDialogOpenAtom: Atom<boolean> = atom(
  (get) => get(pageSetupSessionStateAtom) !== null,
)
pageSetupDialogOpenAtom.debugLabel = 'spreadsheet.print.pageSetup.open'

export const pageSetupCanEditAtom: Atom<boolean> = atom(
  (get) => get(pageSetupSessionStateAtom)?.phase === 'editing',
)
pageSetupCanEditAtom.debugLabel = 'spreadsheet.print.pageSetup.canEdit'

export const pageSetupCanCancelAtom: Atom<boolean> = atom((get) => {
  const phase = get(pageSetupSessionStateAtom)?.phase
  return phase === 'editing' || phase === 'blocked'
})
pageSetupCanCancelAtom.debugLabel = 'spreadsheet.print.pageSetup.canCancel'

export const pageSetupCanRetryRefreshAtom: Atom<boolean> = atom((get) => {
  const phase = get(pageSetupSessionStateAtom)?.phase
  return phase === 'outcome-unknown' || phase === 'refresh-failed'
})
pageSetupCanRetryRefreshAtom.debugLabel = 'spreadsheet.print.pageSetup.canRetryRefresh'

/** @internal Storage atoms are command implementation details, not public write APIs. */
export { pageSetupRequestSequenceAtom, pageSetupSessionSequenceAtom, pageSetupSessionStateAtom }
