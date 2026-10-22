import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  commitCellEditingAtom,
  activeWorkbookSheetAtom,
  dispatchEditorKeyboardInputAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  updateFormulaDraftAtom,
  insertEditingLineBreakAtom,
  editingSessionAtom,
  projectedFreezeAtom,
  getViewportRangeRectangle,
  mergeRangeAt,
  projectionSnapshotAtom,
  viewportMetricsAtom,
  viewportGeometrySizesAtom,
  type EditorKeyboardOutcome,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from 'react'
import { useEffect, useId, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useLingui } from '@lingui/react/macro'
import './cell-editor.css'
import { useFormulaInput } from './use-formula-input'
import { FormulaAssist } from '../../formula/FormulaAssist'
import {
  WORKBOOK_GRID_ROW_HEIGHT,
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
} from '../viewport/workbook-grid-config'

export interface CellEditorProps {
  readonly focusGrid: () => void
}

/** Renders the active in-cell input over its Rust-projected grid cell. */
export function CellEditor({ focusGrid }: CellEditorProps) {
  const { i18n, t } = useLingui()
  const session = useAtomValue(editingSessionAtom)
  const draft = useAtomValue(editingDraftAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const dispatchEditorKeyboard = useSetAtom(dispatchEditorKeyboardInputAtom)
  const setDraft = useSetAtom(updateFormulaDraftAtom)
  const insertLineBreak = useSetAtom(insertEditingLineBreakAtom)
  const instanceId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formulaInput = useFormulaInput(inputRef, 'cell')
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

  // 实例前缀隔离 ARIA；坐标后缀仍识别旧异步提交，避免完成时抢走下一格焦点。
  const fieldIdentity = `cell-editor-${instanceId}-r${cell.row}-c${cell.col}`
  const sheetId = activeSheet?.id ?? ''
  const merge =
    projection?.kind === 'visible-window' && projection.sheetId === sheetId
      ? mergeRangeAt(projection.mergedRanges ?? [], cell)
      : undefined
  const metrics = {
    ...viewportMetrics,
    sheetId,
    rowCount: activeSheet?.rowCount ?? 0,
    colCount: activeSheet?.colCount ?? 0,
    rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
    colWidth: WORKBOOK_GRID_COLUMN_WIDTH,
  }
  const rect = getViewportRangeRectangle(
    metrics,
    sizeOverrides,
    merge ?? {
      rowStart: cell.row,
      rowEnd: cell.row,
      colStart: cell.col,
      colEnd: cell.col,
    },
  )
  const frozenRow = freeze?.sheetId === sheetId && cell.row < freeze.rows
  const frozenCol = freeze?.sheetId === sheetId && cell.col < freeze.cols

  const restoreFocus = (outcome: EditorKeyboardOutcome) => {
    // 同一个 textarea 已用于下一格时，上一格的 Enter 不能抢走新编辑器焦点。
    if (inputRef.current !== null && inputRef.current.id !== fieldIdentity) return
    // 原输入框卸载/禁用会把焦点交给 body；用户已进入其它控件时，旧请求不能抢回焦点。
    if (document.activeElement !== document.body && document.activeElement !== inputRef.current)
      return
    if (outcome === 'completed' || outcome === 'cancelled') focusGrid()
    if (outcome === 'rejected') inputRef.current?.focus({ preventScroll: true })
  }

  const commitOnce = async (restoreKeyboardFocus: boolean) => {
    if (committingRef.current || busy) return
    committingRef.current = true
    try {
      const outcome = await commitEditing()
      if (restoreKeyboardFocus) restoreFocus(outcome)
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
      restoreFocus(outcome)
    } finally {
      committingRef.current = false
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (formulaInput.onFormulaKey(event)) return
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
  const top = WORKBOOK_GRID_ROW_HEIGHT + rect.top + (frozenRow ? metrics.scrollTop : 0)
  const left = WORKBOOK_GRID_ROW_HEADER_WIDTH + rect.left + (frozenCol ? metrics.scrollLeft : 0)
  const height = Math.max(rect.height, Math.min(5, draft.split('\n').length) * 18 + 6)
  const viewportTop = metrics.scrollTop + WORKBOOK_GRID_ROW_HEIGHT
  const viewportLeft = metrics.scrollLeft + WORKBOOK_GRID_ROW_HEADER_WIDTH
  const frozenHeight = freeze?.sheetId === sheetId ? freeze.height : 0
  const frozenWidth = freeze?.sheetId === sheetId ? freeze.width : 0
  // 编辑器保持挂载以保留草稿／焦点，仅裁掉表头及其它固定区上的绘制与命中。
  // 允许负 inset，让错误提示仍能超出单元格，但不能超出可编辑的视口。
  const clipTop = viewportTop + (frozenRow ? 0 : frozenHeight) - top
  const clipLeft = viewportLeft + (frozenCol ? 0 : frozenWidth) - left
  const clipRight = left + rect.width - viewportLeft - metrics.viewportWidth
  const clipBottom = top + height - viewportTop - metrics.viewportHeight
  const style = {
    '--editor-top': `${top}px`,
    '--editor-height': `${height}px`,
    '--editor-left': `${left}px`,
    '--editor-width': `${rect.width}px`,
    clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`,
  } as CSSProperties
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
        aria-label={t`Cell editor`}
        aria-autocomplete="list"
        aria-controls={formulaInput.activeOption ? formulaInput.listId : undefined}
        aria-activedescendant={formulaInput.activeOption}
        aria-invalid={feedback ? true : undefined}
        aria-describedby={feedback ? `${fieldIdentity}-feedback` : formulaInput.signatureId}
        disabled={busy}
        id={fieldIdentity}
        name={fieldIdentity}
        onChange={(event) =>
          setDraft({ draft: event.currentTarget.value, caret: event.currentTarget.selectionStart })
        }
        onSelect={formulaInput.onSelect}
        onKeyDown={onKeyDown}
        value={draft}
        rows={1}
      />
      <FormulaAssist inputRef={inputRef} id={formulaInput.listId} source="cell" />
      {feedback && (
        <div className="cell-editor-feedback" id={`${fieldIdentity}-feedback`} role="alert">
          <span>{translateFeedback(i18n, feedback.message)}</span>
        </div>
      )}
    </div>
  )
}
