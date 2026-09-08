import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  commitCellEditingAtom,
  activeWorkbookSheetAtom,
  dispatchEditorKeyboardInputAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  insertEditingLineBreakAtom,
  editingSessionAtom,
  visibleWindowAtom,
  getAxisOffsetForIndex,
  getViewportRowHeight,
  viewportSizeOverridesAtom,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from 'react'
import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import './cell-editor.css'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../viewport/workbook-grid-config'

export interface CellEditorProps {
  readonly focusGrid: () => void
}

/** Renders the active in-cell input over its Rust-projected grid cell. */
export function CellEditor({ focusGrid }: CellEditorProps) {
  const session = useAtomValue(editingSessionAtom)
  const draft = useAtomValue(editingDraftAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const window = useAtomValue(visibleWindowAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const sizeOverrides = useAtomValue(viewportSizeOverridesAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const dispatchEditorKeyboard = useSetAtom(dispatchEditorKeyboardInputAtom)
  const setDraft = useSetAtom(editingDraftAtom)
  const insertLineBreak = useSetAtom(insertEditingLineBreakAtom)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const committingRef = useRef(false)
  const suppressBlurRef = useRef(false)
  const cell = session.source?.cell ?? null
  const busy = lifecycle.status === 'pending' || lifecycle.status === 'outcome-unknown'
  const feedback = editingCommitFeedback(lifecycle)
  const editingFromFormulaBar = session.source?.source === 'formula-bar'
  const editingFromKeyboard = session.source?.source === 'keyboard'

  useEffect(() => {
    if (editingFromFormulaBar) return
    const input = inputRef.current
    input?.focus({ preventScroll: true })
    if (editingFromKeyboard) {
      const end = input?.value.length ?? 0
      input?.setSelectionRange(end, end)
    } else {
      input?.select()
    }
  }, [cell?.col, cell?.row, editingFromFormulaBar, editingFromKeyboard])

  if (cell === null || editingFromFormulaBar) return null

  const sheetId = activeSheet?.id ?? ''
  const rowCount = activeSheet?.rowCount ?? 0
  const rowHeights = sizeOverrides.rowHeightsBySheet[sheetId]
  const editorTop =
    getAxisOffsetForIndex(cell.row, rowCount, WORKBOOK_GRID_ROW_HEIGHT, rowHeights) -
    getAxisOffsetForIndex(window.rowStart, rowCount, WORKBOOK_GRID_ROW_HEIGHT, rowHeights)
  const editorHeight = getViewportRowHeight(
    sizeOverrides,
    sheetId,
    cell.row,
    WORKBOOK_GRID_ROW_HEIGHT,
  )

  const commitOnce = async (restoreKeyboardFocus: boolean) => {
    if (committingRef.current || busy) return
    committingRef.current = true
    try {
      const outcome = await commitEditing()
      if (restoreKeyboardFocus && outcome === 'completed') focusGrid()
      if (restoreKeyboardFocus && outcome === 'rejected') inputRef.current?.focus()
    } finally {
      committingRef.current = false
    }
  }
  const runKeyboardCommand = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (committingRef.current || busy) return
    committingRef.current = true
    try {
      const outcome = await dispatchEditorKeyboard({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      })
      if (outcome === 'completed' || outcome === 'cancelled') focusGrid()
      if (outcome === 'rejected') inputRef.current?.focus()
    } finally {
      committingRef.current = false
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      const input = event.currentTarget
      let caret: number | null = null
      // 先让 atom 草稿落到 DOM，再还原光标，避免受控输入把光标推到末尾。
      flushSync(() => {
        caret = insertLineBreak({ start: input.selectionStart, end: input.selectionEnd })
      })
      if (caret !== null) input.setSelectionRange(caret, caret)
      return
    }
    if (event.key !== 'Escape' && event.key !== 'Enter' && event.key !== 'Tab') return
    event.preventDefault()
    if (event.key === 'Escape') suppressBlurRef.current = true
    void runKeyboardCommand(event)
  }
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget.dataset.formulaInput === 'true'
    ) {
      return
    }
    if (!event.currentTarget.contains(event.relatedTarget)) void commitOnce(false)
  }
  const stopPointer = (event: PointerEvent<HTMLDivElement>) => event.stopPropagation()
  const style = {
    '--editor-top': `${editorTop}px`,
    '--editor-height': `${Math.max(editorHeight, Math.min(5, draft.split('\n').length) * 18 + 6)}px`,
    '--editor-col': cell.col - window.colStart,
  } as CSSProperties
  const fieldIdentity = `cell-editor-r${cell.row}-c${cell.col}`

  return (
    <div
      className="cell-editor"
      data-cell-editor="true"
      onBlur={onBlur}
      onPointerDown={stopPointer}
      style={style}
    >
      <textarea
        ref={inputRef}
        aria-label="Cell editor"
        disabled={busy}
        id={fieldIdentity}
        name={fieldIdentity}
        onChange={(event) => setDraft({ draft: event.currentTarget.value })}
        onKeyDown={onKeyDown}
        value={draft}
        rows={1}
      />
      {feedback && (
        <div className="cell-editor-feedback" role="alert">
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  )
}
