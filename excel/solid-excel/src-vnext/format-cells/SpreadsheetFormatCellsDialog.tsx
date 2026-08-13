/** @jsxImportSource solid-js */

import { Show } from 'solid-js'
import { useT } from '../../src/i18n'
import { FormatCellsPanel } from './FormatCellsPanel'
import { FormatCellsTabs } from './FormatCellsTabs'
import { useFormatCellsDialogController } from './format-cells-dialog-controller'
import { useFormatCellsDialogFocus } from './format-cells-dialog-focus'
import '@einfach/spreadsheet-ui-styles/features/format-cells-dialog.css'
import '@einfach/spreadsheet-ui-styles/features/format-cells-panels.css'

export interface SpreadsheetFormatCellsDialogProps {
  class?: string
  'data-testid'?: string
}

export function SpreadsheetFormatCellsDialog(props: SpreadsheetFormatCellsDialogProps) {
  const t = useT()
  const controller = useFormatCellsDialogController()
  let dialogRoot: HTMLFormElement | undefined

  useFormatCellsDialogFocus({
    isOpen: controller.isOpen,
    root: () => dialogRoot,
    close: controller.close,
    initialFocus: () => document.getElementById(`format-cells-tab-${controller.activeTab()}`),
  })

  const openEditor = () => {
    const editor = controller.editor()
    return editor.status === 'open' ? editor : null
  }

  return (
    <Show when={controller.isOpen()}>
      <form
        ref={dialogRoot}
        class={`format-cells-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'format-cells-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="format-cells-title"
        aria-describedby={openEditor()?.error ? 'format-cells-save-error' : undefined}
        aria-busy={openEditor()?.pending}
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault()
          if (controller.canSubmit()) controller.save()
        }}
      >
        <div class="format-cells-header">
          <span id="format-cells-title" class="format-cells-title">
            {t('formatCells.title')}
          </span>
          <button
            type="button"
            class="dialog-close-x"
            data-testid="dialog-close-x"
            aria-label={t('dialog.close.label')}
            onClick={controller.close}
          >
            ×
          </button>
        </div>
        <FormatCellsTabs activeTab={controller.activeTab} setTab={controller.setTab} t={t} />
        <FormatCellsPanel
          activeTab={controller.activeTab}
          draft={controller.draft}
          category={controller.category}
          preview={controller.preview}
          setCategory={controller.setCategory}
          patch={controller.patch}
          t={t}
        />
        <div class="format-cells-actions">
          <Show when={openEditor()?.error}>
            {(message) => (
              <span id="format-cells-save-error" role="alert" data-testid="format-cells-save-error">
                {message()}
              </span>
            )}
          </Show>
          <button type="button" data-testid="format-cells-cancel" onClick={controller.close}>
            {t('formatCells.cancel')}
          </button>
          <button type="submit" data-testid="format-cells-save" disabled={!controller.canSubmit()}>
            {t('formatCells.save')}
          </button>
        </div>
      </form>
    </Show>
  )
}
