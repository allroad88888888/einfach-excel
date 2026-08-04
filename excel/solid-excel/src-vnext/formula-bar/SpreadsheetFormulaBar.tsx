import { createEffect, createMemo, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import type {
  CellCoord,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import {
  editingDraftAtom,
  editingSessionAtom,
  focusFormulaBarAtom,
  formulaBarStateAtom,
  startEditingAtom,
  syncFormulaBarAtom,
  selectionSnapshotAtom,
  spillProjectedFormulaAtom,
  toA1,
  workspaceSessionAtom,
  type FormulaBarSyncInput,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../../src/i18n'
import { isVisibleProjectionResult } from '../provider'
import {
  dispatchEditingCancel,
  dispatchEditingCommit,
  notifyDraftTypedChar,
  syncFormulaReferenceCaret,
} from '../provider/edit-dispatch'
import { spreadsheetProjectionSnapshotAtom } from '../provider/atoms'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { SpreadsheetNameBox } from '../name-box'
import { createFormulaBarKeyHandler } from './formula-bar-keys'

export interface SpreadsheetFormulaBarProps {
  class?: string
  'data-testid'?: string
}

function getSourceTextFromProjection(
  result: VisibleProjectionResult | undefined,
  cell: CellCoord,
  activeSheetId: string,
): string | undefined {
  if (!result || result.sheetId !== activeSheetId) return undefined
  if (
    cell.row < result.window.rowStart ||
    cell.row > result.window.rowEnd ||
    cell.col < result.window.colStart ||
    cell.col > result.window.colEnd
  ) {
    return undefined
  }

  const draftCell = result.cells.find(
    (projectionCell) => projectionCell.row === cell.row && projectionCell.col === cell.col,
  )
  return draftCell ? (draftCell.formula ?? draftCell.displayValue ?? '') : ''
}

export function SpreadsheetFormulaBar(props: SpreadsheetFormulaBarProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const t = useT()
  const selectionSnapshot = useAtomValue(selectionSnapshotAtom)
  const formulaBarState = useAtomValue(formulaBarStateAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const editingDraft = useAtomValue(editingDraftAtom)
  const projectionSnapshot = useAtomValue(spreadsheetProjectionSnapshotAtom)
  const spillProjectedFormula = useAtomValue(spillProjectedFormulaAtom)
  const workspace = useAtomValue(workspaceSessionAtom)
  let inputRef: HTMLInputElement | undefined

  function resolveActiveSheetId() {
    const selection = selectionSnapshot()
    if (selection.selection.sheetId) return selection.selection.sheetId
    const visible = isVisibleProjectionResult(projectionSnapshot().result)
      ? projectionSnapshot().result
      : undefined
    return visible?.sheetId || workspace().activeSheetId || ''
  }

  // Sync the formula-bar's "synced draft" from projection when not actively
  // editing. While editing, the value reflects the live editingDraftAtom so
  // typing in the formula bar mirrors the in-cell editor.
  createEffect(() => {
    if (editingSession().status === 'drafting') return
    const selection = selectionSnapshot()
    const snapshot = projectionSnapshot()
    const visibleResult = isVisibleProjectionResult(snapshot.result)
      ? snapshot.result
      : undefined
    const activeSheetId = resolveActiveSheetId()
    const draft = getSourceTextFromProjection(visibleResult, selection.activeCell, activeSheetId)
    if (draft === undefined) {
      const current = store.getter(formulaBarStateAtom)
      const sameCell =
        current.sheetId === activeSheetId &&
        current.cell?.row === selection.activeCell.row &&
        current.cell?.col === selection.activeCell.col
      if (sameCell) return
    }

    const input: FormulaBarSyncInput = {
      sheetId: activeSheetId,
      cell: selection.activeCell,
      draft: draft ?? '',
      source: 'selection',
      revision: visibleResult?.revision,
    }
    store.setter(syncFormulaBarAtom, input)
  })

  /**
   * 活动单元格是不是某个数组的**投影格** —— 是的话公式栏显示锚点的公式，且整条
   * 不接受输入。
   *
   * 三条设计要点：
   *
   * 1. **只在没有编辑会话时成立。** 用户在格子里直接打字是 Excel 允许的（ADR 0006：
   *    数组塌成 `#SPILL!`），那时 `status === 'drafting'`，这里立刻回 `null`，公式栏
   *    照常镜像 `editingDraft`。只读态因此**不会**顺手禁掉合法的写入路径。
   * 2. **纯显示层，不写进任何 atom。** `formulaBarStateAtom.draft` 仍然是这一格自己的
   *    源文本（投影值），锚点公式只覆盖**显示**。反过来做会把一条别人的公式放进
   *    「待提交的草稿」里，任何一个读 `draft` 去提交的路径都会把整个数组打成 `#SPILL!`
   *    —— 那正是这条特性要防的事故。
   * 3. **后端答不出锚点公式就整条不生效**，退回原行为（显示投影值、可编辑）。
   */
  const spillReadonly = createMemo(() => {
    if (editingSession().status === 'drafting') return null
    return spillProjectedFormula()(resolveActiveSheetId(), selectionSnapshot().activeCell)
  })

  // The input element's value: editingDraft while drafting, otherwise the
  // formula-bar synced draft (which reflects the projection source text).
  const displayValue = createMemo(() => {
    if (editingSession().status === 'drafting') return editingDraft()
    const readonly = spillReadonly()
    if (readonly) return readonly.formula
    return formulaBarState().draft
  })

  function ensureEditingSession(initialDraft: string) {
    if (editingSession().status === 'drafting') return
    const selection = selectionSnapshot()
    const sheetId = resolveActiveSheetId()
    if (!sheetId) return
    store.setter(startEditingAtom, {
      sheetId,
      cell: selection.activeCell,
      draft: initialDraft,
      source: 'formula-bar',
    })
  }

  function onInput(event: InputEvent) {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    // `readOnly` 已经挡住键盘与粘贴，这里是第二道闸：少了它，任何一条绕过 DOM
    // 只读位的输入（程序化派发的 input 事件、某些 IME 合成路径）都会把锚点公式
    // 当成用户输入提交进投影格，直接把整个数组塌成 `#SPILL!`。
    const readonly = spillReadonly()
    if (readonly) {
      target.value = readonly.formula
      return
    }
    const next = target.value
    if (editingSession().status !== 'drafting') {
      // First keystroke in the formula bar opens an editing session for the
      // currently-selected cell. The draft becomes the typed value.
      ensureEditingSession(next)
    } else {
      store.setter(editingDraftAtom, { draft: next, source: 'formula-bar' })
    }
    notifyDraftTypedChar(store, target.selectionStart ?? next.length)
  }

  function onSelectionChange(event: Event) {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    if (editingSession().status !== 'drafting') return
    syncFormulaReferenceCaret(store, target.selectionStart ?? 0)
  }

  const handleKeyDown = createFormulaBarKeyHandler({
    store,
    isReadonly: () => spillReadonly() !== null,
    async commit() {
      if (editingSession().status === 'drafting') {
        await dispatchEditingCommit(store, backend, { source: 'formula-bar', move: 'none' })
      }
      inputRef?.blur()
    },
    cancel() {
      dispatchEditingCancel(store)
      inputRef?.blur()
    },
    setCaret(caret) {
      inputRef?.focus()
      inputRef?.setSelectionRange(caret, caret)
    },
  })

  function bindInputRef(node: HTMLInputElement | undefined | null) {
    if (!node || inputRef === node) {
      return
    }

    const listener = (event: KeyboardEvent) => {
      void handleKeyDown(event)
    }

    inputRef = node
    node.addEventListener('keydown', listener)

    onCleanup(() => {
      node.removeEventListener('keydown', listener)
    })
  }

  const cellAddress = () => {
    const active = selectionSnapshot().activeCell
    return toA1(active.row, active.col)
  }

  /** 只读态下「那条公式的主人在哪」，A1 形式 —— 用户要去改的就是这一格。 */
  const spillAnchorLabel = createMemo(() => {
    const readonly = spillReadonly()
    return readonly ? toA1(readonly.anchor.row, readonly.anchor.col) : undefined
  })

  return (
    <div
      class={`formula-bar spreadsheet-formula-bar ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'formula-bar'}
    >
      <SpreadsheetNameBox />
      <span
        class="formula-bar-addr spreadsheet-formula-bar-addr"
        data-testid="formula-bar-addr"
        aria-hidden="true"
        style={{ display: 'none' }}
      >
        {cellAddress()}
      </span>
      <input
        class="formula-bar-input spreadsheet-formula-bar-input"
        data-testid="formula-bar-input"
        type="text"
        // a11y: the visible address chip next to this input is `display:none`
        // + `aria-hidden`, so the field had no accessible name at all (axe
        // `label`, critical). Screen readers announced it as an unlabeled
        // edit box. Matches Excel's own "Formula bar" announcement.
        aria-label="Formula bar"
        // 投影格：显示锚点的公式，但不接受编辑 —— 在这里敲一个字就会把这条公式
        // 提交进投影格，按 ADR 0006 的写入语义整个数组会塌成 `#SPILL!`。Excel 同样
        // 把它做成灰色只读。`data-*` 是这条性质的测试抓手。
        readOnly={spillAnchorLabel() !== undefined}
        aria-readonly={spillAnchorLabel() !== undefined ? 'true' : undefined}
        title={
          spillAnchorLabel() === undefined
            ? undefined
            : t('spill.projectedFormula', { addr: spillAnchorLabel() })
        }
        data-spill-readonly={spillAnchorLabel() === undefined ? undefined : 'true'}
        data-spill-anchor={spillAnchorLabel()}
        value={displayValue()}
        onInput={onInput}
        onSelect={onSelectionChange}
        onClick={onSelectionChange}
        onKeyUp={(event) => {
          // Caret-only key events (ArrowLeft/Right/Home/End) don't fire
          // onSelect — sync explicitly so signature + autocomplete
          // recompute against the new caret position.
          if (
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight' ||
            event.key === 'Home' ||
            event.key === 'End'
          ) {
            onSelectionChange(event)
          }
        }}
        onFocus={() => {
          store.setter(focusFormulaBarAtom, true)
        }}
        onBlur={() => {
          store.setter(focusFormulaBarAtom, false)
        }}
        ref={(node) => {
          bindInputRef(node)
        }}
      />
    </div>
  )
}
