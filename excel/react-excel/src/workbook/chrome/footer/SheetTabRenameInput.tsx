import { useEffect, useRef } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runWorkbookSheetCommandAtom, sheetTabsAtom } from '@einfach-excel/spreadsheet-ui-core'
import './sheet-tab-rename.css'

/** 工作表标签原位编辑的 DOM 与焦点；名称草稿仍由 UI Core 持有。 */
export function SheetTabRenameInput({ errorId, busy }: { errorId: string; busy: boolean }) {
  const { t } = useLingui()
  const state = useAtomValue(sheetTabsAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    input?.focus()
    input?.select()
    // 网格会保留焦点，因此点击网格也需要结束标签编辑。
    const commitOutside = (event: PointerEvent) => {
      if (event.target instanceof Node &&
        !input?.closest('.workbook-sheet-controls')?.contains(event.target)) {
        void run({ operation: 'rename' })
      }
    }
    input?.ownerDocument.addEventListener('pointerdown', commitOutside, true)
    return () => input?.ownerDocument.removeEventListener('pointerdown', commitOutside, true)
  }, [run])

  useEffect(() => {
    if (state.error && !busy) inputRef.current?.focus()
  }, [state.error, busy])

  return (
    <form
      className="sheet-tab-rename"
      onSubmit={(event) => {
        event.preventDefault()
        const tab = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role="tab"]')
        void run({ operation: 'rename' }).then((completed) => {
          if (completed) tab?.focus()
        })
      }}
    >
      <input
        ref={inputRef}
        aria-label={t`Sheet name`}
        value={state.rename?.draftName ?? ''}
        aria-invalid={!!state.error}
        aria-describedby={state.error ? errorId : undefined}
        readOnly={busy}
        onChange={(event) => void run({ operation: 'change-name', name: event.currentTarget.value })}
        onBlur={() => void run({ operation: 'rename' })}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
          if (event.key === 'Escape') {
            event.preventDefault()
            const tab = event.currentTarget.parentElement?.parentElement
              ?.querySelector<HTMLButtonElement>('[role="tab"]')
            void run({ operation: 'cancel-rename' }).then((completed) => {
              if (completed) tab?.focus()
            })
          }
        }}
      />
    </form>
  )
}
