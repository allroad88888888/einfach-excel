import { atom, type Atom } from '@einfach/core'
import { workspaceSessionAtom } from '../workspace'
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
  ConditionalFormatRulesLoadState,
} from './types'
import {
  closeEditorState,
  freezeEditorState,
  freezeLedger,
  freezeRulesLoadState,
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

export const conditionalFormatRulesLoadStateAtom = atom<ConditionalFormatRulesLoadState>(
  freezeRulesLoadState({
    phase: 'idle',
    sheetId: null,
    sessionId: null,
    requestId: null,
    error: null,
  }),
)
conditionalFormatRulesLoadStateAtom.debugLabel = 'spreadsheet.conditionalFormat.rulesLoadState'

export const conditionalFormatRulesLoadAtom: Atom<ConditionalFormatRulesLoadState> = atom((get) =>
  freezeRulesLoadState(get(conditionalFormatRulesLoadStateAtom)),
)
conditionalFormatRulesLoadAtom.debugLabel = 'spreadsheet.conditionalFormat.rulesLoad'

export const conditionalFormatEditorStateAtom = atom<ConditionalFormatEditorState>(
  freezeEditorState(INITIAL_EDITOR_STATE),
)
conditionalFormatEditorStateAtom.debugLabel = 'spreadsheet.conditionalFormat.editorState'

export const conditionalFormatEditorAtom: Atom<ConditionalFormatEditorState> = atom((get) =>
  freezeEditorState(get(conditionalFormatEditorStateAtom)),
)
conditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.editor'

export const conditionalFormatRequestSequenceAtom = atom(0)
export const conditionalFormatMutationLaunchStateAtom =
  atom<ConditionalFormatMutationLaunchState>(null)

export const conditionalFormatOperationAttemptLedgerStateAtom = atom<
  readonly ConditionalFormatOperationAttempt[]
>(Object.freeze([]))
conditionalFormatOperationAttemptLedgerStateAtom.debugLabel =
  'spreadsheet.conditionalFormat.operationAttemptLedgerState'

export const conditionalFormatOperationAttemptLedgerAtom: Atom<
  readonly ConditionalFormatOperationAttempt[]
> = atom((get) => freezeLedger(get(conditionalFormatOperationAttemptLedgerStateAtom)))
conditionalFormatOperationAttemptLedgerAtom.debugLabel =
  'spreadsheet.conditionalFormat.operationAttemptLedger'

export const conditionalFormatMutationBlockedAtom: Atom<boolean> = atom((get): boolean =>
  get(conditionalFormatOperationAttemptLedgerStateAtom).some(
    (attempt) => attempt.status === 'outcome-unknown',
  ),
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

/** Clears rules and stale selection before a view asks its input port to load a sheet. */
export const syncConditionalFormatRulesSheetAtom = atom(
  null,
  (get, set, activeSheetId: string | null): void => {
    const normalizedSheetId =
      typeof activeSheetId === 'string' && activeSheetId.length > 0 ? activeSheetId : null
    // Legacy callers without workspace ownership still use the cache as their
    // explicit target. There is no active-sheet transition to synchronize.
    if (normalizedSheetId === null) return
    const cache = get(conditionalFormatRulesCacheStateAtom)
    if (cache.sheetId !== normalizedSheetId) {
      set(
        conditionalFormatRulesCacheStateAtom,
        freezeRulesState({ sheetId: normalizedSheetId, rules: [] }),
      )
    }
    const load = get(conditionalFormatRulesLoadStateAtom)
    if (load.sheetId !== normalizedSheetId) {
      set(
        conditionalFormatRulesLoadStateAtom,
        freezeRulesLoadState({
          phase: 'idle',
          sheetId: normalizedSheetId,
          sessionId: null,
          requestId: null,
          error: null,
        }),
      )
    }
    const editor = get(conditionalFormatEditorStateAtom)
    if (!editor.open || editor.sheetId === normalizedSheetId) return
    if (editor.pending) {
      set(conditionalFormatEditorStateAtom, freezeEditorState(closeEditorState(editor)))
      return
    }
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({
        ...editor,
        sheetId: normalizedSheetId,
        ruleId: null,
        draft: null,
        selectedKind: 'cell-value',
        error: null,
      }),
    )
  },
)
syncConditionalFormatRulesSheetAtom.debugLabel = 'spreadsheet.conditionalFormat.syncRulesSheet'

export const openConditionalFormatEditorAtom = atom(
  null,
  (get, set, entry: ConditionalFormatRuleEntry | null) => {
    const previous = get(conditionalFormatEditorStateAtom)
    const cache = get(conditionalFormatRulesCacheStateAtom)
    let activeSheetId: string | null = null
    try {
      const workspace = get(workspaceSessionAtom)
      activeSheetId =
        typeof workspace.activeSheetId === 'string' && workspace.activeSheetId.length > 0
          ? workspace.activeSheetId
          : null
    } catch {
      return
    }
    const sheetId = activeSheetId ?? cache.sheetId
    const cachedEntry =
      entry === null ? null : (cache.rules.find((candidate) => candidate.id === entry.id) ?? null)
    const legacyEntryWithoutSheet =
      entry !== null && activeSheetId === null && cache.sheetId === null
    if (
      entry !== null &&
      !legacyEntryWithoutSheet &&
      (sheetId === null || cache.sheetId !== sheetId || cachedEntry === null)
    )
      return
    const selectingCurrentSheetEntry =
      entry !== null && previous.open && previous.sheetId === sheetId
    const sessionId = selectingCurrentSheetEntry
      ? previous.sessionId
      : nextConditionalFormatSessionId(previous.sessionId)
    if (sessionId === null) {
      set(
        conditionalFormatEditorStateAtom,
        freezeEditorState({
          ...previous,
          open: false,
          pending: false,
          error: 'Conditional formatting session identity space is exhausted',
        }),
      )
      return
    }
    const draft =
      cachedEntry === null
        ? entry === null
          ? null
          : snapshotEntry(entry)
        : snapshotEntry(cachedEntry)
    if ((entry !== null && draft === null) || get(conditionalFormatEditorStateAtom) !== previous)
      return
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({
        open: true,
        sessionId,
        sheetId,
        requestId: null,
        ruleId: draft?.id ?? null,
        draft,
        selectedKind: draft?.rule.kind ?? 'cell-value',
        pending: false,
        error: null,
      }),
    )
  },
)
openConditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.openEditor'

export const closeConditionalFormatEditorAtom = atom(null, (get, set) => {
  set(
    conditionalFormatEditorStateAtom,
    freezeEditorState(closeEditorState(get(conditionalFormatEditorStateAtom))),
  )
})
closeConditionalFormatEditorAtom.debugLabel = 'spreadsheet.conditionalFormat.closeEditor'

export const setConditionalFormatEditorKindAtom = atom(
  (get) => get(conditionalFormatEditorAtom),
  (get, set, selectedKind: ConditionalFormatRuleKind) => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!editor.open || editor.pending || !isOneOf(selectedKind, RULE_KINDS)) return
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({ ...editor, selectedKind, error: null }),
    )
  },
)
setConditionalFormatEditorKindAtom.debugLabel = 'spreadsheet.conditionalFormat.setEditorKind'
