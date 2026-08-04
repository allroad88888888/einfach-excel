import { atom, type Atom } from '@einfach/core'
import { INITIAL_EDITOR_STATE, RULE_KINDS } from './constants'
import type { ConditionalFormatMutationLaunchState } from './mutation-types'
import { isOneOf } from './snapshot-format'
import { snapshotEntry, snapshotRulesState } from './snapshot-rules'
import type {
  ConditionalFormatEditorState,
  ConditionalFormatOperationAttempt,
  ConditionalFormatRuleEntry,
  ConditionalFormatRuleKind,
  ConditionalFormatRulesState,
} from './types'
import {
  closeEditorState,
  freezeEditorState,
  freezeLedger,
  freezeRulesState,
  nextConditionalFormatSessionId,
} from './value-domain'

export const conditionalFormatRulesCacheStateAtom = atom<ConditionalFormatRulesState>(
  freezeRulesState({ sheetId: null, rules: [] }),
)
conditionalFormatRulesCacheStateAtom.debugLabel = 'spreadsheet.conditionalFormat.rulesCacheState'

export const conditionalFormatRulesCacheAtom: Atom<ConditionalFormatRulesState> = atom((get) =>
  freezeRulesState(get(conditionalFormatRulesCacheStateAtom)),
)
conditionalFormatRulesCacheAtom.debugLabel = 'spreadsheet.conditionalFormat.rulesCache'

export const conditionalFormatEditorStateAtom = atom<ConditionalFormatEditorState>(
  freezeEditorState(INITIAL_EDITOR_STATE),
)
conditionalFormatEditorStateAtom.debugLabel = 'spreadsheet.conditionalFormat.editorState'

export const conditionalFormatEditorAtom: Atom<ConditionalFormatEditorState> = atom((get) =>
  freezeEditorState(get(conditionalFormatEditorStateAtom)),
)
conditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.editor'

export const conditionalFormatRequestSequenceAtom = atom(0)
export const conditionalFormatMutationLaunchStateAtom = atom<ConditionalFormatMutationLaunchState>(null)

export const conditionalFormatOperationAttemptLedgerStateAtom = atom<
  readonly ConditionalFormatOperationAttempt[]
>(Object.freeze([]))
conditionalFormatOperationAttemptLedgerStateAtom.debugLabel = 'spreadsheet.conditionalFormat.operationAttemptLedgerState'

export const conditionalFormatOperationAttemptLedgerAtom: Atom<readonly ConditionalFormatOperationAttempt[]> = atom((get) =>
  freezeLedger(get(conditionalFormatOperationAttemptLedgerStateAtom)),
)
conditionalFormatOperationAttemptLedgerAtom.debugLabel = 'spreadsheet.conditionalFormat.operationAttemptLedger'

export const conditionalFormatMutationBlockedAtom: Atom<boolean> = atom((get): boolean =>
  get(conditionalFormatOperationAttemptLedgerStateAtom).some((attempt) => attempt.status === 'outcome-unknown'),
)
conditionalFormatMutationBlockedAtom.debugLabel = 'spreadsheet.conditionalFormat.mutationBlocked'

export const setConditionalFormatRulesAtom = atom(
  null,
  (get, set, next: ConditionalFormatRulesState) => {
    const previous = get(conditionalFormatRulesCacheStateAtom)
    const snapshot = snapshotRulesState(next)
    if (snapshot === null || get(conditionalFormatRulesCacheStateAtom) !== previous) return
    set(conditionalFormatRulesCacheStateAtom, freezeRulesState(snapshot))
  },
)
setConditionalFormatRulesAtom.debugLabel = 'spreadsheet.conditionalFormat.setRules'

export const openConditionalFormatEditorAtom = atom(
  null,
  (get, set, entry: ConditionalFormatRuleEntry | null) => {
    const previous = get(conditionalFormatEditorStateAtom)
    const sessionId = nextConditionalFormatSessionId(previous.sessionId)
    if (sessionId === null) {
      set(conditionalFormatEditorStateAtom, freezeEditorState({ ...previous, open: false, pending: false, error: 'Conditional formatting session identity space is exhausted' }))
      return
    }
    const draft = entry === null ? null : snapshotEntry(entry)
    if ((entry !== null && draft === null) || get(conditionalFormatEditorStateAtom) !== previous) return
    set(conditionalFormatEditorStateAtom, freezeEditorState({
      open: true,
      sessionId,
      requestId: null,
      ruleId: draft?.id ?? null,
      draft,
      selectedKind: draft?.rule.kind ?? 'cell-value',
      pending: false,
      error: null,
    }))
  },
)
openConditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.openEditor'

export const closeConditionalFormatEditorAtom = atom(null, (get, set) => {
  set(conditionalFormatEditorStateAtom, freezeEditorState(closeEditorState(get(conditionalFormatEditorStateAtom))))
})
closeConditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.closeEditor'

export const setConditionalFormatEditorKindAtom = atom(
  (get) => get(conditionalFormatEditorAtom),
  (get, set, selectedKind: ConditionalFormatRuleKind) => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!editor.open || editor.pending || !isOneOf(selectedKind, RULE_KINDS)) return
    set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, selectedKind, error: null }))
  },
)
setConditionalFormatEditorKindAtom.debugLabel = 'spreadsheet.conditionalFormat.setEditorKind'
