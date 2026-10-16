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
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef } from 'react'
import { SheetDeleteConfirmation } from './SheetDeleteConfirmation'

/** 工作表标签交互；名称草稿、命令状态都由 UI Core 持有。 */
export function WorkbookSheetTabs() {
  const { i18n, t } = useLingui()
  const document = useAtomValue(workbookDocumentAtom)
  const active = useAtomValue(activeWorkbookSheetAtom)
  const state = useAtomValue(sheetTabsAtom)
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const history = useAtomValue(rustHistoryPanelAtom)
  const editing = useAtomValue(editingSessionAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const picking = useAtomValue(formulaReferenceActiveAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const busy = state.mutation !== null || clipboard.busy || history.busy ||
    lifecycle.status === 'pending' || lifecycle.status === 'outcome-unknown'
  const structureBusy = busy || picking ||
    (editing.source !== null && editing.source.sheetId !== active?.id)
  const index = document.sheets.findIndex((sheet) => sheet.id === active?.id)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [state.rename?.sheetId])
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active?.id, active?.name, active?.index])

  return (
    <div className="workbook-sheet-controls">
      <div className="sheet-tabs">
        <button
          className="sheet-nav"
          type="button"
          aria-label={t`Previous sheet`}
          disabled={busy || index <= 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'switch', sheetId: document.sheets[index - 1]!.id })}
        >
          ‹
        </button>
        <button
          className="sheet-nav"
          type="button"
          aria-label={t`Next sheet`}
          disabled={busy || index >= document.sheets.length - 1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'switch', sheetId: document.sheets[index + 1]!.id })}
        >
          ›
        </button>
        <button
          className="add-sheet"
          type="button"
          aria-label={t`New sheet`}
          title={t`New sheet`}
          disabled={structureBusy}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'add' })}
        >
          ＋
        </button>
        <div className="sheet-tab-list" role="tablist" aria-label={t`Workbook sheets`} ref={tabsRef}>
          {document.sheets.map((sheet) => (
            <button
              className={sheet.id === active?.id ? 'sheet-tab active' : 'sheet-tab'}
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={sheet.id === active?.id}
              title={t`${sheet.name} — double-click or F2 to rename`}
              disabled={busy}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void run({ operation: 'switch', sheetId: sheet.id })}
              onDoubleClick={() => void run({ operation: 'begin-rename', sheetId: sheet.id })}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault()
                  void run({ operation: 'begin-rename', sheetId: sheet.id })
                }
              }}
            >
              <span aria-hidden="true" />
              {sheet.name}
            </button>
          ))}
        </div>
        <button
          className="rename-sheet"
          type="button"
          aria-label={t`Rename sheet`}
          title={t`Rename sheet`}
          disabled={structureBusy || !active}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => active && void run({ operation: 'begin-rename', sheetId: active.id })}
        >
          ✎
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label={t`Move sheet left`}
          title={t`Move sheet left`}
          disabled={structureBusy || index <= 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'move-left' })}
        >
          ⇤
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label={t`Move sheet right`}
          title={t`Move sheet right`}
          disabled={structureBusy || index >= document.sheets.length - 1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'move-right' })}
        >
          ⇥
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label={t`Delete sheet`}
          title={t`Delete sheet`}
          disabled={structureBusy || document.sheets.length <= 1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'request-delete' })}
        >
          ×
        </button>
      </div>
      {state.rename && (
        <form
          className="sheet-rename"
          onSubmit={(event) => {
            event.preventDefault()
            void run({ operation: 'rename' })
          }}
        >
          <input
            ref={inputRef}
            aria-label={t`Sheet name`}
            value={state.rename.draftName}
            aria-invalid={!!state.error}
            aria-describedby={state.error ? 'sheet-command-error' : undefined}
            disabled={busy}
            onChange={(event) =>
              void run({ operation: 'change-name', name: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                void run({ operation: 'cancel-rename' })
              }
            }}
          />
          <button type="submit" disabled={busy}><Trans>
            Save
          </Trans></button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ operation: 'cancel-rename' })}
          ><Trans>
            Cancel
          </Trans></button>
        </form>
      )}
      {state.error && !state.deleteConfirmation && (
        <p id="sheet-command-error" className="sheet-command-error" role="alert">
          {translateFeedback(i18n, state.error)}
        </p>
      )}
      <SheetDeleteConfirmation />
    </div>
  )
}
