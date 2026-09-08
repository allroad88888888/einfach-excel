import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  workbookDocumentAtom,
  sheetTabsAtom,
  runWorkbookSheetCommandAtom,
  systemClipboardFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef } from 'react'
import { SheetDeleteConfirmation } from './SheetDeleteConfirmation'

/** 工作表标签交互；名称草稿、命令状态都由 UI Core 持有。 */
export function WorkbookSheetTabs() {
  const document = useAtomValue(workbookDocumentAtom)
  const active = useAtomValue(activeWorkbookSheetAtom)
  const state = useAtomValue(sheetTabsAtom)
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const busy = state.mutation !== null || clipboard.busy
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
          aria-label="Previous sheet"
          disabled={busy || index <= 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'switch', sheetId: document.sheets[index - 1]!.id })}
        >
          ‹
        </button>
        <button
          className="sheet-nav"
          type="button"
          aria-label="Next sheet"
          disabled={busy || index >= document.sheets.length - 1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'switch', sheetId: document.sheets[index + 1]!.id })}
        >
          ›
        </button>
        <button
          className="add-sheet"
          type="button"
          aria-label="New sheet"
          title="New sheet"
          disabled={busy}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'add' })}
        >
          ＋
        </button>
        <div className="sheet-tab-list" role="tablist" aria-label="Workbook sheets" ref={tabsRef}>
          {document.sheets.map((sheet) => (
            <button
              className={sheet.id === active?.id ? 'sheet-tab active' : 'sheet-tab'}
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={sheet.id === active?.id}
              title={`${sheet.name} — double-click or F2 to rename`}
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
          aria-label="Rename sheet"
          title="Rename sheet"
          disabled={busy || !active}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => active && void run({ operation: 'begin-rename', sheetId: active.id })}
        >
          ✎
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label="Move sheet left"
          title="Move sheet left"
          disabled={busy || index <= 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'move-left' })}
        >
          ⇤
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label="Move sheet right"
          title="Move sheet right"
          disabled={busy || index >= document.sheets.length - 1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'move-right' })}
        >
          ⇥
        </button>
        <button
          className="sheet-action"
          type="button"
          aria-label="Delete sheet"
          title="Delete sheet"
          disabled={busy || document.sheets.length <= 1}
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
            aria-label="Sheet name"
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
          <button type="submit" disabled={busy}>
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ operation: 'cancel-rename' })}
          >
            Cancel
          </button>
        </form>
      )}
      {state.error && !state.deleteConfirmation && (
        <p id="sheet-command-error" className="sheet-command-error" role="alert">
          {state.error}
        </p>
      )}
      <SheetDeleteConfirmation />
    </div>
  )
}
