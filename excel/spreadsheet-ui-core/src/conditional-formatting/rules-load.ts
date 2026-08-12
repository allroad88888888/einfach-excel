import { atom, type Getter, type Setter } from '@einfach/core'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import { snapshotRulesResult } from './acknowledgement'
import { CONDITIONAL_FORMAT_RULES_MAX } from './constants'
import {
  conditionalFormatEditorStateAtom,
  conditionalFormatRequestSequenceAtom,
  conditionalFormatRulesCacheStateAtom,
  conditionalFormatRulesLoadStateAtom,
} from './state'
import type {
  ConditionalFormatRulesLoadState,
  ConditionalFormatRulesResponseTicket,
  LoadConditionalFormatRulesInput,
} from './types'
import { errorMessage } from './snapshot-format'
import {
  freezeEditorState,
  freezeRulesLoadState,
  freezeRulesState,
  nextConditionalFormatRequestId,
} from './value-domain'

function sameLoad(
  load: ConditionalFormatRulesLoadState,
  sheetId: string,
  sessionId: number,
): boolean {
  return load.sheetId === sheetId && load.sessionId === sessionId && load.phase !== 'idle'
}

function setLoadError(
  get: Getter,
  set: Setter,
  ticket: ConditionalFormatRulesResponseTicket & { readonly sessionId: number },
  error: string,
): void {
  const editor = get(conditionalFormatEditorStateAtom)
  const load = get(conditionalFormatRulesLoadStateAtom)
  if (
    !editor.open ||
    editor.sessionId !== ticket.sessionId ||
    editor.sheetId !== ticket.sheetId ||
    load.sheetId !== ticket.sheetId ||
    load.sessionId !== ticket.sessionId ||
    load.requestId !== ticket.requestId
  )
    return
  set(
    conditionalFormatRulesLoadStateAtom,
    freezeRulesLoadState({
      phase: 'error',
      sheetId: ticket.sheetId,
      sessionId: ticket.sessionId,
      requestId: ticket.requestId,
      error,
    }),
  )
  set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, error }))
}

function loadTargetIsCurrent(
  get: Getter,
  ticket: ConditionalFormatRulesResponseTicket & { readonly sessionId: number },
  workspaceWitness: unknown,
): boolean {
  try {
    const editor = get(conditionalFormatEditorStateAtom)
    const cache = get(conditionalFormatRulesCacheStateAtom)
    const load = get(conditionalFormatRulesLoadStateAtom)
    const workspace = get(workspaceSessionAtom)
    return (
      editor.open &&
      editor.sessionId === ticket.sessionId &&
      editor.sheetId === ticket.sheetId &&
      cache.sheetId === ticket.sheetId &&
      load.phase === 'pending' &&
      load.sheetId === ticket.sheetId &&
      load.sessionId === ticket.sessionId &&
      load.requestId === ticket.requestId &&
      workspace.activeSheetId === ticket.sheetId &&
      get(workspaceActiveSheetAuthorityWitnessAtom) === workspaceWitness
    )
  } catch {
    return false
  }
}

async function loadConditionalFormatRules(
  get: Getter,
  set: Setter,
  input: LoadConditionalFormatRulesInput,
): Promise<void> {
  const editor = get(conditionalFormatEditorStateAtom)
  if (!editor.open || editor.pending || editor.sheetId === null) return
  let workspaceWitness: unknown
  try {
    workspaceWitness = get(workspaceActiveSheetAuthorityWitnessAtom)
    const workspace = get(workspaceSessionAtom)
    if (
      workspace.activeSheetId !== editor.sheetId ||
      get(workspaceActiveSheetAuthorityWitnessAtom) !== workspaceWitness
    )
      return
  } catch {
    return
  }
  const cache = get(conditionalFormatRulesCacheStateAtom)
  const load = get(conditionalFormatRulesLoadStateAtom)
  if (cache.sheetId !== editor.sheetId || sameLoad(load, editor.sheetId, editor.sessionId)) return
  if (input.listRules === undefined) {
    const ticket = { sheetId: editor.sheetId, sessionId: editor.sessionId, requestId: -1 }
    set(
      conditionalFormatRulesLoadStateAtom,
      freezeRulesLoadState({
        phase: 'error',
        sheetId: ticket.sheetId,
        sessionId: ticket.sessionId,
        requestId: ticket.requestId,
        error: 'Conditional formatting rules are unavailable',
      }),
    )
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({
        ...editor,
        error: 'Conditional formatting rules are unavailable',
      }),
    )
    return
  }
  const expectedSequence = get(conditionalFormatRequestSequenceAtom)
  const requestId = nextConditionalFormatRequestId(expectedSequence)
  if (requestId === null) {
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({
        ...editor,
        error: 'Conditional formatting request ticket space is exhausted',
      }),
    )
    return
  }
  const ticket = Object.freeze({ sheetId: editor.sheetId, sessionId: editor.sessionId, requestId })
  if (
    get(conditionalFormatEditorStateAtom) !== editor ||
    get(conditionalFormatRulesCacheStateAtom) !== cache ||
    get(conditionalFormatRulesLoadStateAtom) !== load ||
    get(conditionalFormatRequestSequenceAtom) !== expectedSequence
  )
    return
  set(conditionalFormatRequestSequenceAtom, requestId)
  set(
    conditionalFormatRulesLoadStateAtom,
    freezeRulesLoadState({
      phase: 'pending',
      sheetId: ticket.sheetId,
      sessionId: ticket.sessionId,
      requestId: ticket.requestId,
      error: null,
    }),
  )
  try {
    const resultValue = await Promise.resolve(
      input.listRules({
        kind: 'list-conditional-format-rules',
        sheetId: ticket.sheetId,
        requestId: ticket.requestId,
        ...(cache.revision === undefined ? {} : { revision: cache.revision }),
      }),
    )
    const snapshot = snapshotRulesResult(resultValue, ticket)
    if (!loadTargetIsCurrent(get, ticket, workspaceWitness)) return
    if (snapshot.result === null) {
      setLoadError(
        get,
        set,
        ticket,
        snapshot.error ?? 'Conditional formatting rules response was invalid',
      )
      return
    }
    set(
      conditionalFormatRulesCacheStateAtom,
      freezeRulesState({
        sheetId: snapshot.result.sheetId,
        rules:
          snapshot.result.rules.length > CONDITIONAL_FORMAT_RULES_MAX
            ? snapshot.result.rules.slice(-CONDITIONAL_FORMAT_RULES_MAX)
            : snapshot.result.rules,
        revision: snapshot.result.revision,
      }),
    )
    set(
      conditionalFormatRulesLoadStateAtom,
      freezeRulesLoadState({
        phase: 'ready',
        sheetId: ticket.sheetId,
        sessionId: ticket.sessionId,
        requestId: ticket.requestId,
        error: null,
      }),
    )
  } catch (error) {
    if (loadTargetIsCurrent(get, ticket, workspaceWitness)) {
      setLoadError(get, set, ticket, errorMessage(error))
    }
  }
}

/** Runs a sheet-bound persisted-rule read through a caller-owned input port. */
export const loadConditionalFormatRulesAtom = atom(
  null,
  (get, set, input: LoadConditionalFormatRulesInput): Promise<void> =>
    Promise.resolve().then(() => loadConditionalFormatRules(get, set, input)),
)
loadConditionalFormatRulesAtom.debugLabel = 'spreadsheet.conditionalFormat.loadRules'
