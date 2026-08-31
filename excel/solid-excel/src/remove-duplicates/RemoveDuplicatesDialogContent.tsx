/** @jsxImportSource solid-js */

import { For, Show, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
  DisplayCell,
  RemoveDuplicatesComparison,
  RemoveDuplicatesRange,
  RemoveDuplicatesScanResult,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../i18n'

export const REMOVE_DUPLICATES_DIALOG_TITLE_ID = 'remove-duplicates-dialog-title'
export const REMOVE_DUPLICATES_DIALOG_PREVIEW_ID = 'remove-duplicates-dialog-preview'
export const REMOVE_DUPLICATES_DIALOG_ERROR_ID = 'remove-duplicates-dialog-error'

const COMPARISON_CHOICES: readonly RemoveDuplicatesComparison[] = [
  'exact',
  'caseInsensitive',
  'trim',
  'trimAndIgnoreCase',
]

interface ColumnDescriptor {
  readonly col: number
  readonly letter: string
  readonly label: string
}

export interface RemoveDuplicatesDialogContentProps {
  readonly range: Accessor<RemoveDuplicatesRange | null>
  readonly cells: Accessor<readonly DisplayCell[]>
  readonly keyColumns: Accessor<ReadonlySet<number>>
  readonly comparison: Accessor<RemoveDuplicatesComparison>
  readonly excludeHeader: Accessor<boolean>
  readonly preview: Accessor<RemoveDuplicatesScanResult | null>
  readonly error: Accessor<string>
  readonly canEdit: Accessor<boolean>
  readonly canClose: Accessor<boolean>
  readonly canConfirm: Accessor<boolean>
  readonly canRetryRead: Accessor<boolean>
  readonly setCloseButtonRef: (element: HTMLButtonElement) => void
  readonly onSetExcludeHeader: (excludeHeader: boolean) => void
  readonly onToggleColumn: (column: number) => void
  readonly onSelectAllColumns: () => void
  readonly onDeselectAllColumns: () => void
  readonly onSetComparison: (comparison: RemoveDuplicatesComparison) => void
  readonly onClose: () => void
  readonly onRetryRead: () => void
}

/** Excel-style letters: A-Z, AA-AZ, and so on. */
function columnLetter(index: number): string {
  let n = index
  let out = ''
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  }
  return out
}

/** Renders the Remove Duplicates dialog fields from immutable feature projections. */
export function RemoveDuplicatesDialogContent(props: RemoveDuplicatesDialogContentProps) {
  const t = useT()
  const columnDescriptors = createMemo<readonly ColumnDescriptor[]>(() => {
    const range = props.range()
    if (range === null) return []
    const headerByColumn = new Map<number, string>()
    if (props.excludeHeader()) {
      for (const cell of props.cells()) {
        if (cell.row !== range.startRow) continue
        const display = cell.displayValue ?? ''
        if (display.trim().length > 0) headerByColumn.set(cell.col, display)
      }
    }
    const descriptors: ColumnDescriptor[] = []
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const letter = columnLetter(col)
      const header = headerByColumn.get(col)
      descriptors.push({ col, letter, label: header ? `${letter} — ${header}` : letter })
    }
    return descriptors
  })
  const previewMessage = createMemo(() => {
    const preview = props.preview()
    if (preview === null) return ''
    if (preview.noKeyColumns) return t('removeDuplicates.preview.noKeyColumns')
    if (preview.duplicateRows.length === 0) return t('removeDuplicates.preview.noDuplicates')
    return t('removeDuplicates.preview.summary', {
      duplicates: preview.duplicateRows.length,
      scanned: preview.scannedRows,
      unique: preview.uniqueRows,
    })
  })

  return (
    <>
      <div class="rd-header">
        <h2 id={REMOVE_DUPLICATES_DIALOG_TITLE_ID} class="rd-title">
          {t('removeDuplicates.title')}
        </h2>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="remove-duplicates-close-x"
          aria-label={t('dialog.close.label')}
          disabled={!props.canClose()}
          ref={props.setCloseButtonRef}
          onClick={props.onClose}
        >
          ×
        </button>
      </div>

      <div class="rd-body">
        <label class="rd-option">
          <input
            type="checkbox"
            data-testid="remove-duplicates-exclude-header"
            checked={props.excludeHeader()}
            disabled={!props.canEdit()}
            onChange={(event) => props.onSetExcludeHeader(event.currentTarget.checked)}
          />
          {t('removeDuplicates.excludeHeader')}
        </label>

        <fieldset class="rd-fieldset" data-testid="remove-duplicates-columns-group">
          <legend class="rd-legend">{t('removeDuplicates.columns.legend')}</legend>
          <div class="rd-columns-grid">
            <For each={columnDescriptors()}>
              {(descriptor) => (
                <label class="rd-checkbox">
                  <input
                    type="checkbox"
                    data-testid={`remove-duplicates-column-${descriptor.col}`}
                    checked={props.keyColumns().has(descriptor.col)}
                    disabled={!props.canEdit()}
                    onChange={() => props.onToggleColumn(descriptor.col)}
                  />
                  {descriptor.label}
                </label>
              )}
            </For>
          </div>
          <div class="rd-column-actions">
            <button
              type="button"
              class="rd-link-btn"
              data-testid="remove-duplicates-select-all"
              disabled={!props.canEdit()}
              onClick={props.onSelectAllColumns}
            >
              {t('removeDuplicates.columns.selectAll')}
            </button>
            <button
              type="button"
              class="rd-link-btn"
              data-testid="remove-duplicates-deselect-all"
              disabled={!props.canEdit()}
              onClick={props.onDeselectAllColumns}
            >
              {t('removeDuplicates.columns.deselectAll')}
            </button>
          </div>
        </fieldset>

        <fieldset class="rd-fieldset" data-testid="remove-duplicates-comparison-group">
          <legend class="rd-legend">{t('removeDuplicates.comparison.legend')}</legend>
          <div class="rd-comparison-grid">
            <For each={COMPARISON_CHOICES}>
              {(choice) => (
                <label class="rd-radio">
                  <input
                    type="radio"
                    name="remove-duplicates-comparison"
                    data-testid={`remove-duplicates-comparison-${choice}`}
                    checked={props.comparison() === choice}
                    disabled={!props.canEdit()}
                    onChange={() => props.onSetComparison(choice)}
                  />
                  {t(`removeDuplicates.comparison.${choice}`)}
                </label>
              )}
            </For>
          </div>
        </fieldset>

        <div class="rd-preview" data-testid="remove-duplicates-preview">
          <div class="rd-preview-label">{t('removeDuplicates.preview.label')}</div>
          <div id={REMOVE_DUPLICATES_DIALOG_PREVIEW_ID} class="rd-preview-text" aria-live="polite">
            {previewMessage()}
          </div>
        </div>
        <Show when={props.error().length > 0}>
          <div
            id={REMOVE_DUPLICATES_DIALOG_ERROR_ID}
            class="rd-error"
            data-testid="remove-duplicates-error"
            role="alert"
          >
            <span>{props.error()}</span>
            <Show when={props.canRetryRead()}>
              <button
                type="button"
                class="rd-link-btn"
                data-testid="remove-duplicates-retry-read"
                onClick={props.onRetryRead}
              >
                {t('findReplace.action.retryRefresh')}
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <div class="rd-footer">
        <button
          type="button"
          class="rd-btn"
          data-testid="remove-duplicates-cancel-button"
          disabled={!props.canClose()}
          onClick={props.onClose}
        >
          {t('removeDuplicates.cancel')}
        </button>
        <button
          type="submit"
          class="rd-btn rd-btn-primary"
          data-testid="remove-duplicates-confirm-button"
          disabled={!props.canConfirm()}
        >
          {t('removeDuplicates.confirm')}
        </button>
      </div>
    </>
  )
}
