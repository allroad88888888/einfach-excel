import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  workbookDocumentAtom,
  sheetTabsAtom,
  runWorkbookSheetCommandAtom,
  systemClipboardFeedbackAtom,
  rustHistoryPanelAtom,
  editingSessionAtom,
  editingCommitLifecycleAtom,
  formulaReferenceActiveAtom,
  openSheetTabMenuAtom,
  switchAdjacentSheetAtom,
  groupedSheetIdsAtom,
  isSheetGroupActiveAtom,
  adjacentVisibleSheet,
  visibleSheets,
  readOnlySheetIdsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { SheetTabRenameInput } from './SheetTabRenameInput'
import { SheetDeleteConfirmation } from './SheetDeleteConfirmation'
import { SheetTabContextMenu } from '../../sheet-management/SheetTabContextMenu'
import { UnhideSheetDialog } from '../../sheet-management/UnhideSheetDialog'

/** 工作表标签交互；名称草稿、命令状态都由 UI Core 持有。 */
export function WorkbookSheetTabs() {
  const { i18n, t } = useLingui()
  const errorId = useId()
  const document = useAtomValue(workbookDocumentAtom)
  const active = useAtomValue(activeWorkbookSheetAtom)
  const state = useAtomValue(sheetTabsAtom)
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const history = useAtomValue(rustHistoryPanelAtom)
  const editing = useAtomValue(editingSessionAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const picking = useAtomValue(formulaReferenceActiveAtom)
  const grouped = useAtomValue(groupedSheetIdsAtom)
  const isGroupActive = useAtomValue(isSheetGroupActiveAtom)
  const readOnlySheets = useAtomValue(readOnlySheetIdsAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const openMenu = useSetAtom(openSheetTabMenuAtom)
  const switchAdjacent = useSetAtom(switchAdjacentSheetAtom)
  const tabsRef = useRef<HTMLDivElement>(null)
  const busy = state.mutation !== null || clipboard.busy || history.busy ||
    lifecycle.status === 'pending' || lifecycle.status === 'outcome-unknown'
  const structureBusy = busy || picking ||
    (editing.source !== null && editing.source.sheetId !== active?.id)
  const visible = visibleSheets(document.sheets)
  const hasPrevious = adjacentVisibleSheet(document.sheets, active?.id ?? null, 'previous') !== null
  const hasNext = adjacentVisibleSheet(document.sheets, active?.id ?? null, 'next') !== null

  useEffect(() => {
    const list = tabsRef.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !tab) return
    const bounds = list.getBoundingClientRect(), activeBounds = tab.getBoundingClientRect()
    // 只滚动本实例的页签列表，不能让 scrollIntoView 连带移动宿主文档。
    if (activeBounds.left < bounds.left) list.scrollLeft += activeBounds.left - bounds.left
    else if (activeBounds.right > bounds.right) list.scrollLeft += activeBounds.right - bounds.right
  }, [active?.id, active?.name, active?.index])

  return (
    <div className="workbook-sheet-controls">
      <div className="sheet-tabs">
        <button
          className="sheet-nav"
          data-direction="previous"
          type="button"
          aria-label={t`Previous sheet`}
          disabled={busy || !hasPrevious}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void switchAdjacent('previous')}
        />
        <button
          className="sheet-nav"
          data-direction="next"
          type="button"
          aria-label={t`Next sheet`}
          disabled={busy || !hasNext}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void switchAdjacent('next')}
        />
        <div className="sheet-tab-list" role="tablist" aria-label={t`Workbook sheets`} ref={tabsRef}>
          {visible.map((sheet) => {
            const isActive = sheet.id === active?.id
            const isGrouped = isGroupActive && grouped.includes(sheet.id)
            return (
              <div className="sheet-tab-slot" key={sheet.id}>
                <button
                  className={`sheet-tab${isActive ? ' active' : ''}${isGrouped ? ' grouped' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={sheet.name}
                  data-sheet-id={sheet.id}
                  data-renaming={state.rename?.sheetId === sheet.id || undefined}
                  tabIndex={state.rename?.sheetId === sheet.id ? -1 : 0}
                  data-grouped={isGrouped ? 'true' : undefined}
                  data-tab-color={sheet.tabColor}
                  data-read-only={readOnlySheets.has(sheet.id) ? 'true' : undefined}
                  style={sheet.tabColor ? ({ '--tab-color': sheet.tabColor } as CSSProperties) : undefined}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (event.button === 0 && event.ctrlKey) {
                      void run({ operation: 'switch', sheetId: sheet.id, mode: 'toggle' })
                      return
                    }
                    void openMenu({ sheetId: sheet.id, x: event.clientX, y: event.clientY })
                  }}
                  title={t`${sheet.name} — double-click or F2 to rename`}
                  disabled={busy}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) =>
                    void run({
                      operation: 'switch',
                      sheetId: sheet.id,
                      mode: event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'range' : 'single',
                    })
                  }
                  onDoubleClick={() => void run({ operation: 'begin-rename', sheetId: sheet.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      event.preventDefault()
                      const bounds = event.currentTarget.getBoundingClientRect()
                      openMenu({ sheetId: sheet.id, x: bounds.left, y: bounds.top })
                      return
                    }
                    if (event.key === 'F2') {
                      event.preventDefault()
                      void run({ operation: 'begin-rename', sheetId: sheet.id })
                    }
                  }}
                >
                  {sheet.name}
                </button>
                {state.rename?.sheetId === sheet.id && (
                  <SheetTabRenameInput errorId={errorId} busy={busy} />
                )}
              </div>
            )
          })}
        </div>
        <button
          className="add-sheet"
          type="button"
          aria-label={t`New sheet`}
          title={t`New sheet`}
          disabled={structureBusy}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'add' })}
        >
          +
        </button>
        {isGroupActive && (
          <span className="sheet-group-badge" data-sheet-group-badge>
            <Trans>[Group]</Trans>
          </span>
        )}
      </div>
      {state.error && !state.deleteConfirmation && (
        <p id={errorId} data-sheet-command-error className="sheet-command-error" role="alert">
          {translateFeedback(i18n, state.error)}
        </p>
      )}
      <SheetDeleteConfirmation />
      <SheetTabContextMenu structureBusy={structureBusy} />
      <UnhideSheetDialog />
    </div>
  )
}
