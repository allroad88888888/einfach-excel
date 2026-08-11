import { atom, type Getter, type Setter } from '@einfach/core'
import type { SpreadsheetBackend } from '../backend'
import { DEFAULT_PRINT_CONFIG, printConfigStateAtom } from './config-state'
import {
  capturePageSetupPorts,
  capturePageSetupReadPort,
  hasExactPageSetupMutationAcknowledgement,
  nextPageSetupIdentity,
  pageSetupErrorMessage,
  snapshotExactPageSetupRead,
  snapshotPrintConfig,
  type PageSetupPorts,
  type PageSetupOperationTicket,
} from './page-setup-domain'
import {
  pageSetupRequestSequenceAtom,
  pageSetupSessionAtom,
  pageSetupSessionSequenceAtom,
  pageSetupSessionStateAtom,
  type PageSetupSession,
} from './page-setup-state'
import type { PageSetupDraftPatch, PageSetupSaveOutcome, PrintConfig } from './types'

export interface OpenPageSetupInput {
  readonly sheetId: string
}

export interface RunPageSetupSaveInput {
  readonly source: SpreadsheetBackend
}

export interface RetryPageSetupRefreshInput {
  readonly source: SpreadsheetBackend
}

function ownsTicket(get: Getter, ticket: PageSetupOperationTicket): boolean {
  const session = get(pageSetupSessionAtom)
  return (
    session?.sessionId === ticket.sessionId &&
    session.sheetId === ticket.sheetId &&
    session.mutationRequestId === ticket.mutationRequestId &&
    session.refreshRequestId === ticket.refreshRequestId
  )
}

function nextRequestId(get: Getter, set: Setter): number | null {
  const requestId = nextPageSetupIdentity(get(pageSetupRequestSequenceAtom))
  if (requestId !== null) set(pageSetupRequestSequenceAtom, requestId)
  return requestId
}

function blockedOutcome(phase: PageSetupSession['phase']): PageSetupSaveOutcome {
  if (phase === 'outcome-unknown') return 'outcome-unknown'
  if (phase === 'refresh-failed') return 'refresh-failed'
  return 'stale'
}

function withPatch(draft: PrintConfig, patch: PageSetupDraftPatch): PrintConfig | null {
  const orientation = patch.orientation ?? draft.orientation
  const scale =
    patch.scale === undefined
      ? draft.scale
      : snapshotPrintConfig({
          ...draft,
          scale: patch.scale,
        })?.scale
  if ((orientation !== 'portrait' && orientation !== 'landscape') || scale === undefined)
    return null
  return snapshotPrintConfig({ ...draft, orientation, scale })
}

export const openPageSetupAtom = atom(null, (get, set, input: OpenPageSetupInput): boolean => {
  if (
    get(pageSetupSessionAtom) !== null ||
    typeof input.sheetId !== 'string' ||
    input.sheetId.length === 0
  ) {
    return false
  }
  const sessionId = nextPageSetupIdentity(get(pageSetupSessionSequenceAtom))
  const source = get(printConfigStateAtom)[input.sheetId] ?? DEFAULT_PRINT_CONFIG
  const draft = snapshotPrintConfig(source)
  if (sessionId === null || draft === null) return false
  set(pageSetupSessionSequenceAtom, sessionId)
  set(pageSetupSessionStateAtom, {
    sessionId,
    sheetId: input.sheetId,
    draft,
    phase: 'editing',
    error: '',
    mutationRequestId: null,
    refreshRequestId: null,
  })
  return true
})
openPageSetupAtom.debugLabel = 'spreadsheet.print.pageSetup.open'

export const updatePageSetupDraftAtom = atom(
  null,
  (get, set, patch: PageSetupDraftPatch): boolean => {
    const session = get(pageSetupSessionAtom)
    if (session === null || session.phase !== 'editing') return false
    const draft = withPatch(session.draft, patch)
    if (draft === null) return false
    set(pageSetupSessionStateAtom, { ...session, draft })
    return true
  },
)
updatePageSetupDraftAtom.debugLabel = 'spreadsheet.print.pageSetup.updateDraft'

/** Cancelling is illegal after a dispatched mutation until a read-only reconciliation succeeds. */
export const cancelPageSetupAtom = atom(null, (get, set): boolean => {
  const session = get(pageSetupSessionAtom)
  if (session === null || (session.phase !== 'editing' && session.phase !== 'blocked')) return false
  set(pageSetupSessionStateAtom, null)
  return true
})
cancelPageSetupAtom.debugLabel = 'spreadsheet.print.pageSetup.cancel'

export const runPageSetupSaveAtom = atom(
  null,
  async (get, set, input: RunPageSetupSaveInput): Promise<PageSetupSaveOutcome> => {
    const session = get(pageSetupSessionAtom)
    if (session === null || session.phase !== 'editing') {
      return session === null ? 'stale' : blockedOutcome(session.phase)
    }
    const ports = capturePageSetupPorts(input.source)
    if (ports === null) {
      set(pageSetupSessionStateAtom, {
        ...session,
        phase: 'blocked',
        error: 'Page setup requires both setPrintConfig and readPrintConfig backend ports.',
      })
      return 'blocked'
    }
    const config = snapshotPrintConfig(session.draft)
    const mutationRequestId = nextRequestId(get, set)
    if (config === null || mutationRequestId === null) {
      set(pageSetupSessionStateAtom, {
        ...session,
        phase: 'blocked',
        error: 'Page setup cannot allocate a safe request identity.',
      })
      return 'blocked'
    }
    const saving = {
      ...session,
      phase: 'saving' as const,
      error: '',
      mutationRequestId,
      refreshRequestId: null,
    }
    set(pageSetupSessionStateAtom, saving)
    await Promise.resolve()
    if (get(pageSetupSessionAtom) !== saving) return 'stale'
    try {
      const acknowledgement = await ports.setPrintConfig.call(ports.source, {
        kind: 'set-print-config',
        sheetId: session.sheetId,
        config,
        requestId: mutationRequestId,
      })
      if (get(pageSetupSessionAtom) !== saving) return 'stale'
      if (
        !hasExactPageSetupMutationAcknowledgement(
          acknowledgement,
          session.sheetId,
          mutationRequestId,
        )
      ) {
        set(pageSetupSessionStateAtom, {
          ...saving,
          phase: 'outcome-unknown',
          error:
            'Page setup write did not return an exact acknowledgement. Refresh before editing again.',
        })
        return 'outcome-unknown'
      }
    } catch (error) {
      if (get(pageSetupSessionAtom) !== saving) return 'stale'
      set(pageSetupSessionStateAtom, {
        ...saving,
        phase: 'outcome-unknown',
        error: `Page setup write outcome is unknown: ${pageSetupErrorMessage(error)}`,
      })
      return 'outcome-unknown'
    }
    return refreshSavedPageSetup(get, set, ports, saving)
  },
)
runPageSetupSaveAtom.debugLabel = 'spreadsheet.print.pageSetup.save'

async function refreshSavedPageSetup(
  get: Getter,
  set: Setter,
  ports: PageSetupPorts,
  saving: PageSetupSession,
): Promise<PageSetupSaveOutcome> {
  const refreshRequestId = nextRequestId(get, set)
  if (refreshRequestId === null) {
    set(pageSetupSessionStateAtom, {
      ...saving,
      phase: 'refresh-failed',
      error: 'Page setup cannot allocate a refresh identity.',
    })
    return 'refresh-failed'
  }
  const refreshing = { ...saving, phase: 'refreshing' as const, refreshRequestId }
  const ticket: PageSetupOperationTicket = {
    sessionId: refreshing.sessionId,
    sheetId: refreshing.sheetId,
    mutationRequestId: refreshing.mutationRequestId,
    refreshRequestId,
  }
  set(pageSetupSessionStateAtom, refreshing)
  return readBackPageSetup(get, set, ports, ticket)
}

export const retryPageSetupRefreshAtom = atom(
  null,
  async (get, set, input: RetryPageSetupRefreshInput): Promise<PageSetupSaveOutcome> => {
    const session = get(pageSetupSessionAtom)
    if (
      session === null ||
      (session.phase !== 'outcome-unknown' && session.phase !== 'refresh-failed')
    ) {
      return session === null ? 'stale' : blockedOutcome(session.phase)
    }
    const port = capturePageSetupReadPort(input.source)
    if (port === null) {
      set(pageSetupSessionStateAtom, {
        ...session,
        error: 'Page setup still needs a readPrintConfig backend port to reconcile this result.',
      })
      return 'blocked'
    }
    const refreshRequestId = nextRequestId(get, set)
    if (refreshRequestId === null) return 'blocked'
    const refreshing = { ...session, phase: 'refreshing' as const, error: '', refreshRequestId }
    const ticket: PageSetupOperationTicket = {
      sessionId: refreshing.sessionId,
      sheetId: refreshing.sheetId,
      mutationRequestId: refreshing.mutationRequestId,
      refreshRequestId,
    }
    set(pageSetupSessionStateAtom, refreshing)
    return readBackPageSetup(get, set, port, ticket)
  },
)
retryPageSetupRefreshAtom.debugLabel = 'spreadsheet.print.pageSetup.retryRefresh'

async function readBackPageSetup(
  get: Getter,
  set: Setter,
  port: NonNullable<ReturnType<typeof capturePageSetupReadPort>>,
  ticket: PageSetupOperationTicket,
): Promise<PageSetupSaveOutcome> {
  try {
    const result = await port.readPrintConfig.call(port.source, {
      kind: 'read-print-config',
      sheetId: ticket.sheetId,
      requestId: ticket.refreshRequestId,
    })
    if (!ownsTicket(get, ticket)) return 'stale'
    const config = snapshotExactPageSetupRead(result, ticket.sheetId, ticket.refreshRequestId)
    if (config === null) {
      set(pageSetupSessionStateAtom, {
        ...get(pageSetupSessionAtom)!,
        phase: 'refresh-failed',
        error: 'Page setup read-back did not return an exact configuration receipt.',
      })
      return 'refresh-failed'
    }
    set(printConfigStateAtom, (previous) => ({ ...previous, [ticket.sheetId]: config }))
    set(pageSetupSessionStateAtom, null)
    return 'completed'
  } catch (error) {
    if (!ownsTicket(get, ticket)) return 'stale'
    set(pageSetupSessionStateAtom, {
      ...get(pageSetupSessionAtom)!,
      phase: 'refresh-failed',
      error: `Page setup read-back failed: ${pageSetupErrorMessage(error)}`,
    })
    return 'refresh-failed'
  }
}
