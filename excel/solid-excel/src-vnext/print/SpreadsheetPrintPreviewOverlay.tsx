import { createEffect, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../../src/i18n'
import {
  DEFAULT_PRINT_CONFIG,
  hydratePrintConfigAtom,
  openPageSetupAtom,
  pageSetupDialogOpenAtom,
  printConfigStateAtom,
  printPreviewOpenAtom,
  workspaceSessionAtom,
  type PrintConfig,
} from '@einfach/spreadsheet-ui-core'

import { useOverlayInteraction } from '../overlay'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { SpreadsheetPageSetupDialog } from './SpreadsheetPageSetupDialog'

if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('@einfach/spreadsheet-ui-styles/features/print-preview-dialog.css')
}

export interface SpreadsheetPrintPreviewOverlayProps {
  class?: string
  'data-testid'?: string
}

type Translate = (id: string, values?: Record<string, unknown>) => string

function orientationText(config: PrintConfig, t: Translate): string {
  return t(`printPreview.orientation.${config.orientation}`)
}

function scaleText(config: PrintConfig, t: Translate): string {
  const scale = config.scale
  if (scale.kind === 'percent') return `${scale.percent}%`
  const parts: string[] = []
  if (scale.pagesWide != null) {
    parts.push(t('printPreview.scaling.pagesWide', { count: scale.pagesWide }))
  }
  if (scale.pagesTall != null) {
    parts.push(t('printPreview.scaling.pagesTall', { count: scale.pagesTall }))
  }
  return parts.length > 0
    ? t('printPreview.scaling.fitDimensions', { dimensions: parts.join(' × ') })
    : t('printPreview.scaling.fit')
}

export function SpreadsheetPrintPreviewOverlay(props: SpreadsheetPrintPreviewOverlayProps) {
  let closeButtonRef: HTMLButtonElement | undefined
  let pageSetupButtonRef: HTMLButtonElement | undefined
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const previewOpen = useAtomValue(printPreviewOpenAtom)
  const pageSetupOpen = useAtomValue(pageSetupDialogOpenAtom)
  const printConfigState = useAtomValue(printConfigStateAtom)
  const workspaceSession = useAtomValue(workspaceSessionAtom)

  const activeSheetId = () => workspaceSession().activeSheetId ?? ''

  const config = (): PrintConfig =>
    (activeSheetId() ? printConfigState()[activeSheetId()] : undefined) ?? DEFAULT_PRINT_CONFIG

  createEffect(() => {
    const sheetId = activeSheetId()
    if (!previewOpen() || sheetId.length === 0) return
    void store.setter(hydratePrintConfigAtom, { source: backend, sheetId })
  })

  function closePreview() {
    store.setter(printPreviewOpenAtom, false)
  }

  function openPageSetup() {
    const sheetId = activeSheetId()
    if (sheetId.length === 0) return
    store.setter(openPageSetupAtom, { sheetId })
  }

  function printPreview() {
    if (typeof window === 'undefined' || typeof window.print !== 'function') return
    window.print()
  }

  const overlay = useOverlayInteraction({
    active: previewOpen,
    initialFocus: () => closeButtonRef,
    isTopmost: () => !pageSetupOpen(),
    onRequestClose: closePreview,
  })

  return (
    <>
      <Show when={previewOpen()}>
        <div
          ref={overlay.overlayRef}
          class={`print-preview-overlay spreadsheet-print-preview ${props.class ?? ''}`.trim()}
          data-testid={props['data-testid'] ?? 'print-preview-overlay'}
          data-sheet-id={activeSheetId()}
          role="dialog"
          aria-hidden={pageSetupOpen() ? 'true' : undefined}
          aria-label={t('toolbar.printPreview.title')}
          aria-modal={pageSetupOpen() ? undefined : 'true'}
        >
          <header class="print-preview-dialog-header">
            <h2>{t('toolbar.printPreview.title')}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              class="dialog-close-x"
              data-testid="dialog-close-x"
              aria-label={t('dialog.close.label')}
              onClick={() => closePreview()}
            >
              ×
            </button>
          </header>

          <div class="print-preview-dialog-body">
            <figure class="print-preview-sheet" data-testid="print-preview-sheet">
              <div class="print-preview-paper">
                <Show when={config().header}>
                  <div class="print-preview-page-header">
                    <span>{config().header?.left ?? ''}</span>
                    <span>{config().header?.center ?? ''}</span>
                    <span>{config().header?.right ?? ''}</span>
                  </div>
                </Show>
                <div class="print-preview-page-content" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <Show when={config().footer}>
                  <div class="print-preview-page-footer">
                    <span>{config().footer?.left ?? ''}</span>
                    <span>{config().footer?.center ?? ''}</span>
                    <span>{config().footer?.right ?? ''}</span>
                  </div>
                </Show>
              </div>
              <figcaption>{t('printPreview.worksheetPreview')}</figcaption>
            </figure>

            <dl class="print-preview-summary" aria-label={t('printPreview.settings')}>
              <div>
                <dt>{t('printPreview.orientation.label')}</dt>
                <dd class="print-preview-orientation" data-testid="print-orientation-text">
                  {orientationText(config(), t)}
                </dd>
              </div>
              <div>
                <dt>{t('printPreview.scaling.label')}</dt>
                <dd class="print-preview-scale" data-testid="print-scale-text">
                  {scaleText(config(), t)}
                </dd>
              </div>
              <div>
                <dt>{t('printPreview.pageBreaks')}</dt>
                <dd class="print-preview-page-breaks" data-testid="print-page-breaks-count">
                  {config().manualPageBreaks.length}
                </dd>
              </div>
            </dl>
          </div>

          <footer class="print-preview-actions">
            <button
              type="button"
              class="print-preview-button print-preview-primary"
              data-testid="print-action-button"
              data-variant="primary"
              onClick={printPreview}
            >
              {t('printPreview.action.print')}
            </button>
            <button
              type="button"
              class="print-preview-button print-preview-close"
              data-testid="print-close-button"
              onClick={() => closePreview()}
            >
              {t('printPreview.action.close')}
            </button>
            <button
              ref={pageSetupButtonRef}
              type="button"
              class="print-preview-button print-preview-page-setup"
              data-testid="print-page-setup-button"
              onClick={openPageSetup}
            >
              {t('printPreview.action.pageSetup')}
            </button>
          </footer>
        </div>
      </Show>
      <SpreadsheetPageSetupDialog anchor={() => pageSetupButtonRef} />
    </>
  )
}
