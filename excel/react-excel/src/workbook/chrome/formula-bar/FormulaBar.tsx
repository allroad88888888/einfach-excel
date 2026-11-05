import { PluginEditorAdornments } from '../../../plugin/PluginMounts'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  reconcileCellEditingAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  formulaReferenceTokensAtom,
  updateFormulaDraftAtom,
  insertEditingLineBreakAtom,
  editingSessionAtom,
  activeCellInputTextAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
  activeCellLockedAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { useId, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useFormulaInput } from '../../grid/editor/use-formula-input'
import { FormulaAssist } from '../../formula/FormulaAssist'
import { FormulaReferenceHighlight } from '../../formula-reference/FormulaReferenceHighlight'
import { NameBox } from './NameBox'
import './formula-bar.css'
import { useLingui } from '@lingui/react/macro'

/** Edits the active cell through the same atom session as the in-cell editor. */
export function FormulaBar() {
  const { i18n, t } = useLingui()
  const inputId = useId()
  const feedbackId = useId()
  const selection = useAtomValue(selectionSnapshotAtom)
  const sourceText = useAtomValue(activeCellInputTextAtom)
  const activeCellLocked = useAtomValue(activeCellLockedAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const editingDraft = useAtomValue(editingDraftAtom)
  const hasFormulaRefs = useAtomValue(formulaReferenceTokensAtom).length > 0
  const editingLifecycle = useAtomValue(editingCommitLifecycleAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setEditingDraft = useSetAtom(editingDraftAtom)
  const updateDraft = useSetAtom(updateFormulaDraftAtom)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const formulaInput = useFormulaInput(inputRef, 'formula-bar')
  const insertLineBreak = useSetAtom(insertEditingLineBreakAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const reconcileEditing = useSetAtom(reconcileCellEditingAtom)
  const cancelEditing = useSetAtom(cancelEditingAtom)
  const activeCell = selection.activeCell
  const activeSheetId = selection.selection.sheetId
  const hasEditingSource = editingSession.source !== null
  // 跨表选择引用时，公式栏仍属于原单元格的编辑会话。
  const readOnly = !hasEditingSource && activeCellLocked
  const value = hasEditingSource ? editingDraft : sourceText ?? ''
  const busy =
    editingLifecycle.status === 'pending' || editingLifecycle.status === 'outcome-unknown'
  const feedback =
    hasEditingSource && editingSession.source?.source === 'formula-bar'
      ? editingCommitFeedback(editingLifecycle)
      : null

  const beginFormulaEditing = () => {
    if (readOnly || busy || (!hasEditingSource && sourceText === undefined)) return
    if (hasEditingSource) {
      setEditingDraft({ draft: editingDraft, source: 'formula-bar' })
      return
    }
    startEditing({
      sheetId: activeSheetId,
      cell: { row: activeCell.row, col: activeCell.col },
      source: 'formula-bar',
    })
  }
  const updateFormula = (event: FormEvent<HTMLTextAreaElement>) => {
    if (readOnly) return
    if (!hasEditingSource) {
      const started = startEditing({
        sheetId: activeSheetId,
        cell: { row: activeCell.row, col: activeCell.col },
        source: 'formula-bar',
      })
      if (!started) return
    }
    updateDraft({ draft: event.currentTarget.value, source: 'formula-bar',
      caret: event.currentTarget.selectionStart })
  }

  // 格内编辑跨表后只迁移 DOM 焦点；草稿与写入坐标仍由原编辑 atom 持有。
  const inputSource = editingSession.source?.source
  useLayoutEffect(() => {
    if (inputSource === 'formula-bar') inputRef.current?.focus({ preventScroll: true })
  }, [inputSource])
  const commitFormula = (event: FocusEvent<HTMLDivElement>) => {
    if (!hasEditingSource || busy) return
    if (event.currentTarget.contains(event.relatedTarget) ||
      event.relatedTarget?.closest('[data-cell-editor]')) return
    void commitEditing()
  }
  const focusGrid = () => {
    inputRef.current?.closest('.workbook')
      ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')?.focus({ preventScroll: true })
  }
  const commitFromKeyboard = async () => {
    const input = inputRef.current
    const outcome = await commitEditing()
    // 禁用输入框会让焦点落到 body；迟到响应不能抢走用户已移到其它控件的焦点。
    if (!input?.isConnected ||
      (document.activeElement !== document.body && document.activeElement !== input)) return
    if (outcome === 'completed') focusGrid()
    else if (outcome === 'rejected' || outcome === 'blocked') input.focus({ preventScroll: true })
  }
  const reconcileFromFormulaBar = async () => {
    const outcome = await reconcileEditing()
    if (outcome === 'completed') focusGrid()
  }
  const handleFormulaKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (readOnly) {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault()
        focusGrid()
      }
      return
    }
    // 输入法确认键属于浏览器；229 覆盖部分浏览器 compositionend 后的确认事件。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (formulaInput.onFormulaKey(event)) return
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      const input = event.currentTarget
      let caret: number | null = null
      flushSync(() => {
        caret = insertLineBreak({ start: input.selectionStart, end: input.selectionEnd })
      })
      if (caret !== null) input.setSelectionRange(caret, caret)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      let cancelled = false
      // 先结束 atom 草稿再移焦点，让 blur 不会重新提交刚取消的内容。
      flushSync(() => { cancelled = cancelEditing() === true })
      if (cancelled) focusGrid()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (!busy) void commitFromKeyboard()
    }
  }

  return (
    <>
      <div className="formula-bar">
        <NameBox />
        <span className="formula-divider" aria-hidden="true" />
        <span className="insert-function" aria-hidden="true">
          fx
        </span>
        <div className="formula-input-shell" onBlur={commitFormula}>
          <FormulaReferenceHighlight
            draft={value}
            active={hasEditingSource}
            highlightRef={highlightRef}
          />
          <textarea
            ref={inputRef}
            aria-label={t`Active cell value`}
            aria-autocomplete="list"
            aria-controls={formulaInput.activeOption ? formulaInput.listId : undefined}
            aria-activedescendant={formulaInput.activeOption}
            aria-invalid={feedback ? true : undefined}
            aria-describedby={feedback ? feedbackId : formulaInput.signatureId}
            autoComplete="off"
            className="formula-value"
            data-formula-input="true"
            data-has-formula-refs={hasEditingSource && hasFormulaRefs ? 'true' : undefined}
            disabled={busy || (!hasEditingSource && sourceText === undefined)}
            readOnly={readOnly}
            id={inputId}
            name="formula-input"
            onFocus={beginFormulaEditing}
            onInput={updateFormula}
            onKeyDown={handleFormulaKey}
            onSelect={formulaInput.onSelect}
            onMouseDown={beginFormulaEditing}
            onScroll={(event) => {
              if (highlightRef.current) {
                highlightRef.current.scrollTop = event.currentTarget.scrollTop
                highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
              }
            }}
            spellCheck={false}
            rows={Math.min(4, value.split('\n').length)}
            value={value}
          />
          {inputSource === 'formula-bar' && <PluginEditorAdornments />}
        </div>
      </div>
      <FormulaAssist inputRef={inputRef} id={formulaInput.listId} source="formula-bar" />
      {feedback && (
        <div className="formula-edit-feedback" role="alert">
          <span id={feedbackId}>{translateFeedback(i18n, feedback.message)}</span>
          {editingLifecycle.status === 'outcome-unknown' && (
            <button type="button" onClick={() => void reconcileFromFormulaBar()}>
              {t`Refresh`}
            </button>
          )}
        </div>
      )}
    </>
  )
}
