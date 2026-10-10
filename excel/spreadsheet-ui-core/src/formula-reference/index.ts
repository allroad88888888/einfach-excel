import { atom } from '@einfach/core'
import type { Atom, WritableAtom } from '@einfach/core'
import type { CellCoord } from '../shared'
import { getColumnLabel } from '../shared/grid-coordinates'
import { editingDraftAtom, editingSessionAtom } from '../editing/session-atoms'
import { keyboardModeAtom } from '../keyboard'
import { parseFormulaReferences } from './parser'
import { formulaReferenceCaretBackingAtom, formulaReferenceSessionBackingAtom } from './state'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import type {
  EnterFormulaReferenceInput,
  FormulaReferenceExitReason,
  FormulaReferencePickInput,
  FormulaReferenceSession,
  FormulaReferenceTokenRange,
} from './types'

export * from './parser'
export * from './types'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function serializeCellRef(coord: CellCoord): string {
  return `${getColumnLabel(coord.col)}${coord.row + 1}`
}

export function serializeRangeRef(anchor: CellCoord, focus: CellCoord): string {
  const rowStart = Math.min(anchor.row, focus.row)
  const rowEnd = Math.max(anchor.row, focus.row)
  const colStart = Math.min(anchor.col, focus.col)
  const colEnd = Math.max(anchor.col, focus.col)

  const topLeft: CellCoord = { row: rowStart, col: colStart }
  const bottomRight: CellCoord = { row: rowEnd, col: colEnd }

  if (rowStart === rowEnd && colStart === colEnd) {
    return serializeCellRef(topLeft)
  }

  return `${serializeCellRef(topLeft)}:${serializeCellRef(bottomRight)}`
}

export function spliceDraft(
  draft: string,
  tokenRange: FormulaReferenceTokenRange | null,
  insertionCaret: number,
  token: string,
): { draft: string; end: number } {
  if (tokenRange === null) {
    const before = draft.slice(0, insertionCaret)
    const after = draft.slice(insertionCaret)
    const next = before + token + after
    return { draft: next, end: insertionCaret + token.length }
  }

  const before = draft.slice(0, tokenRange.start)
  const after = draft.slice(tokenRange.end)
  const next = before + token + after
  return { draft: next, end: tokenRange.start + token.length }
}

const TRIGGER_CHARS = new Set(['=', '+', '-', '*', '/', '^', '&', '(', ',', '<', '>'])

export function shouldEnterFormulaReferenceMode(draft: string, caret: number): boolean {
  if (!draft.startsWith('=') || !Number.isInteger(caret) || caret <= 0 || caret > draft.length)
    return false
  // 文本/工作表名里的运算符不是引用入口；双写同类引号是转义。
  let quoted: string | null = null
  for (let i = 0; i < caret; i++) {
    if (quoted) {
      if (draft[i] !== quoted) continue
      if (draft[i + 1] === quoted && i + 1 < caret) {
        i++
        continue
      }
      quoted = null
    } else if (draft[i] === '"' || draft[i] === "'") quoted = draft[i]
  }
  if (quoted) return false

  const charBefore = draft[caret - 1]
  if (!TRIGGER_CHARS.has(charBefore)) return false

  const charAt = draft[caret]
  if (charAt !== undefined && charAt !== ')') return false

  return true
}

// ---------------------------------------------------------------------------
// State boundary
// ---------------------------------------------------------------------------

formulaReferenceSessionBackingAtom.debugLabel = 'spreadsheet.formulaReference.sessionBacking'

export const formulaReferenceSessionAtom: Atom<FormulaReferenceSession | null> = atom((get) =>
  get(formulaReferenceSessionBackingAtom),
)
formulaReferenceSessionAtom.debugLabel = 'spreadsheet.formulaReference.session'

formulaReferenceCaretBackingAtom.debugLabel = 'spreadsheet.formulaReference.caretBacking'

export const formulaReferenceCaretAtom: Atom<number> = atom((get) =>
  get(formulaReferenceCaretBackingAtom),
)
formulaReferenceCaretAtom.debugLabel = 'spreadsheet.formulaReference.caret'

// ---------------------------------------------------------------------------
// Derived atoms
// ---------------------------------------------------------------------------

export const formulaReferenceActiveAtom = atom((get) => get(formulaReferenceSessionAtom) !== null)
formulaReferenceActiveAtom.debugLabel = 'spreadsheet.formulaReference.active'

export const formulaReferenceTokenRangeAtom = atom(
  (get) => get(formulaReferenceSessionAtom)?.tokenRange ?? null,
)
formulaReferenceTokenRangeAtom.debugLabel = 'spreadsheet.formulaReference.tokenRange'

/**
 * Parsed reference tokens for the current editing draft. Returns an empty
 * array when not drafting or when the draft does not start with '='. Hosts
 * subscribe to this to paint colored frames in the grid overlay.
 */
export const formulaReferenceTokensAtom = atom((get) => {
  const session = get(editingSessionAtom)
  if (session.status !== 'drafting') return []
  const draft = get(editingDraftAtom)
  if (!draft.startsWith('=')) return []
  return parseFormulaReferences(draft, session.source?.sheetId ?? null)
})
formulaReferenceTokensAtom.debugLabel = 'spreadsheet.formulaReference.tokens'

// ---------------------------------------------------------------------------
// Command atoms
// ---------------------------------------------------------------------------

export const setFormulaReferenceCaretAtom: WritableAtom<null, [number], void> = atom(
  null,
  (_get, set, caret: number) => {
    set(formulaReferenceCaretBackingAtom, caret)
  },
)
setFormulaReferenceCaretAtom.debugLabel = 'spreadsheet.formulaReference.setCaret'

export const enterFormulaReferenceAtom = atom(
  null,
  (_get, set, input: EnterFormulaReferenceInput) => {
    set(formulaReferenceSessionBackingAtom, {
      anchorCell: { row: input.anchorCell.row, col: input.anchorCell.col },
      sheetId: input.sheetId,
      insertionCaret: input.insertionCaret,
      tokenRange: null,
      pickAnchor: null,
      pickFocus: null,
      dragging: false,
    })
    set(keyboardModeAtom, 'formula-reference')
  },
)
enterFormulaReferenceAtom.debugLabel = 'spreadsheet.formulaReference.enter'

export const pickFormulaReferenceAtom = atom(null, (get, set, input: FormulaReferencePickInput) => {
  const session = get(formulaReferenceSessionBackingAtom)
  if (
    session === null ||
    input.sheetId !== session.sheetId ||
    get(activeEditingCommitTicketAtom) !== null ||
    get(editingSessionAtom).status !== 'drafting'
  )
    return
  if (
    [input.pickAnchor, input.pickFocus].some(
      ({ row, col }) =>
        !Number.isSafeInteger(row) ||
        !Number.isSafeInteger(col) ||
        row < 0 ||
        col < 0 ||
        row >= 1_048_576 ||
        col >= 16_384,
    )
  )
    return

  const currentDraft = get(editingSessionAtom).draft
  let token = serializeRangeRef(input.pickAnchor, input.pickFocus)
  if (input.preserveLocks && session.tokenRange) {
    const previous = currentDraft.slice(session.tokenRange.start, session.tokenRange.end).split(':')
    token = token
      .split(':')
      .map((part, index) => {
        const locks = /^(\$?)[A-Z]+(\$?)\d+$/i.exec(previous[Math.min(index, previous.length - 1)])
        return locks
          ? part.replace(
              /^([A-Z]+)(\d+)$/,
              (_all, col: string, row: string) => `${locks[1]}${col}${locks[2]}${row}`,
            )
          : part
      })
      .join(':')
  }
  const spliced = spliceDraft(currentDraft, session.tokenRange, session.insertionCaret, token)

  set(editingDraftAtom, { draft: spliced.draft })
  set(formulaReferenceCaretBackingAtom, spliced.end)

  set(formulaReferenceSessionBackingAtom, {
    ...session,
    tokenRange: { start: session.tokenRange?.start ?? session.insertionCaret, end: spliced.end },
    pickAnchor: { ...input.pickAnchor },
    pickFocus: { ...input.pickFocus },
    dragging: input.dragging,
  })
})
pickFormulaReferenceAtom.debugLabel = 'spreadsheet.formulaReference.pick'

export const exitFormulaReferenceAtom = atom(
  null,
  (get, set, _reason: FormulaReferenceExitReason) => {
    set(formulaReferenceSessionBackingAtom, null)
    // Restore the keyboard mode to whichever phase logically follows: if an
    // editing session is still active, fall back to 'editing'; otherwise
    // 'navigation'. Callers committing/cancelling editing flip the mode
    // themselves so the explicit reset here only handles operator/paren exits.
    const editing = get(editingSessionAtom)
    set(keyboardModeAtom, editing.status === 'drafting' ? 'editing' : 'navigation')
  },
)
exitFormulaReferenceAtom.debugLabel = 'spreadsheet.formulaReference.exit'
