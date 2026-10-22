import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  updateFormulaDraftAtom,
  insertEditingLineBreakAtom,
  editingSessionAtom,
  activeCellInputTextAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
} from '@einfach/spreadsheet-ui-core'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { useId, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useFormulaInput } from '../../grid/editor/use-formula-input'
import { FormulaAssist } from '../../formula/FormulaAssist'
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
  const editingSession = useAtomValue(editingSessionAtom)
  const editingDraft = useAtomValue(editingDraftAtom)
  const editingLifecycle = useAtomValue(editingCommitLifecycleAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setEditingDraft = useSetAtom(editingDraftAtom)
  const updateDraft = useSetAtom(updateFormulaDraftAtom)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formulaInput = useFormulaInput(inputRef, 'formula-bar')
  const insertLineBreak = useSetAtom(insertEditingLineBreakAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const cancelEditing = useSetAtom(cancelEditingAtom)
  const activeCell = selection.activeCell
  const activeSheetId = selection.selection.sheetId
  const hasEditingSource = editingSession.source !== null
  const value = hasEditingSource ? editingDraft : sourceText ?? ''
  const busy =
    editingLifecycle.status === 'pending' || editingLifecycle.status === 'outcome-unknown'
  const feedback =
    hasEditingSource && editingSession.source?.source === 'formula-bar'
      ? editingCommitFeedback(editingLifecycle)
      : null

  const beginFormulaEditing = () => {
    if (busy || (!hasEditingSource && sourceText === undefined)) return
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
  const commitFormula = (event: FocusEvent<HTMLTextAreaElement>) => {
    if (!hasEditingSource || busy) return
    if (event.relatedTarget?.closest('[data-cell-editor]')) return
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
  const handleFormulaKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
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
          disabled={busy || (!hasEditingSource && sourceText === undefined)}
          id={inputId}
          name="formula-input"
          onBlur={commitFormula}
          onFocus={beginFormulaEditing}
          onInput={updateFormula}
          onKeyDown={handleFormulaKey}
          onSelect={formulaInput.onSelect}
          onMouseDown={beginFormulaEditing}
          spellCheck={false}
          rows={Math.min(4, value.split('\n').length)}
          value={value}
        />
      </div>
      <FormulaAssist inputRef={inputRef} id={formulaInput.listId} source="formula-bar" />
      {feedback && (
        <p className="formula-edit-feedback" id={feedbackId} role="alert">
          {translateFeedback(i18n, feedback.message)}
        </p>
      )}
    </>
  )
}
