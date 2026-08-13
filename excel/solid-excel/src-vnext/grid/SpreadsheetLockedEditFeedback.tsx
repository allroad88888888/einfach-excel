/** @jsxImportSource solid-js */

import { useAtomValue, useSetAtom } from '@einfach/solid'
import {
  dismissLockedEditFeedbackAtom,
  lockedEditFeedbackAtom,
  openProtectionUnlockAtom,
  type LockedEditFeedback,
} from '@einfach/spreadsheet-ui-core'
import { createMemo, Show } from 'solid-js'
import { useT } from '../../src/i18n'

export interface SpreadsheetLockedEditFeedbackProps {
  /** Grid ownership guard for multi-sheet hosts. */
  sheetId: string
}

/** Grid-local recovery alert for an edit rejected by the canonical lock atom. */
export function SpreadsheetLockedEditFeedback(props: SpreadsheetLockedEditFeedbackProps) {
  const t = useT()
  const feedback = useAtomValue(lockedEditFeedbackAtom)
  const dismissFeedback = useSetAtom(dismissLockedEditFeedbackAtom)
  const openProtectionUnlock = useSetAtom(openProtectionUnlockAtom)
  const visibleFeedback = createMemo(() => {
    const current = feedback()
    return current?.sheetId === props.sheetId ? current : null
  })

  function openUnlock(event: MouseEvent, current: LockedEditFeedback) {
    // UI-503 captures the opener on transition to open. Preserve this alert
    // action as that opener even when the browser did not focus it on click.
    if (!(event.currentTarget instanceof HTMLButtonElement)) return
    event.currentTarget.focus()
    openProtectionUnlock({
      sheetId: current.sheetId,
      range: {
        rowStart: current.cell.row,
        rowEnd: current.cell.row,
        colStart: current.cell.col,
        colEnd: current.cell.col,
      },
    })
  }

  return (
    <Show when={visibleFeedback()}>
      {(current) => (
        <section
          class="spreadsheet-locked-edit-feedback"
          data-testid="locked-edit-feedback"
          data-sheet-id={current().sheetId}
          data-cell-row={current().cell.row}
          data-cell-col={current().cell.col}
          role="alert"
          aria-atomic="true"
        >
          <span class="spreadsheet-locked-edit-feedback-message">
            {t('diagnostics.code.mutationBlockedLocked')}
          </span>
          <div class="spreadsheet-locked-edit-feedback-actions">
            <button
              type="button"
              class="spreadsheet-locked-edit-feedback-unlock"
              data-testid="locked-edit-feedback-unlock"
              onClick={(event) => openUnlock(event, current())}
            >
              {t('menuBar.format.unlockRange')}
            </button>
            <button
              type="button"
              class="spreadsheet-locked-edit-feedback-dismiss"
              data-testid="locked-edit-feedback-dismiss"
              onClick={() => dismissFeedback(current())}
            >
              {t('diagnostics.dismiss')}
            </button>
          </div>
        </section>
      )}
    </Show>
  )
}
