import { translateFeedback } from '../../../i18n/translate-feedback'
import { useContext, useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { workbookFilePanelAtom, runWorkbookFileAtom } from '@einfach-excel/spreadsheet-ui-core'
import './workbook-file.css'
import { Trans, useLingui } from '@lingui/react/macro'
import { cycleDialogFocus } from '../ribbon/dialog-focus'
import { WorkbookPresentationContext } from '../../../page/WorkbookPresentationProvider'
import { downloadFile } from './download-file'
import {
  isXlsxFile, loadXlsxConverter, workbookTitleOf, XLSX_MIME_TYPE, xlsxFilename,
} from '../../xlsx/xlsx-converter'

/** 原生文件入口：DOM 负责文件选择、替换确认、下载与模态焦点。 */
export function WorkbookFileTools() {
  const { i18n, t } = useLingui()
  const titleId = useId()
  const state = useAtomValue(workbookFilePanelAtom)
  const run = useSetAtom(runWorkbookFileAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const xlsx = useContext(WorkbookPresentationContext).xlsx
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (state.open) {
      if (dialog.showModal) dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (dialog.open) {
      if (dialog.close) dialog.close()
      else dialog.removeAttribute('open')
      triggerRef.current?.focus()
    }
  }, [state.open])
  return <>
    <button type="button" className="workbook-file-trigger" ref={triggerRef}
      disabled={state.disabled} onClick={() => void run({ action: 'show' })}><Trans>File</Trans></button>
    <dialog ref={dialogRef} className="workbook-file-dialog" aria-labelledby={titleId}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run({ action: 'close' }) }}>
      <h2 id={titleId}><Trans>Workbook files</Trans></h2>
      <p><Trans>Your workbook is in memory. Download a file to keep your changes.</Trans></p>
      <button type="button" disabled={state.busy} onClick={() => void run({
        action: 'download', write: async ({ text, filename }) => {
          downloadFile(text, filename, 'application/json')
        },
      })}><Trans>Download workbook</Trans></button>
      {xlsx && <button type="button" disabled={state.busy} onClick={() => void run({
        action: 'download', write: async ({ text, filename }) => {
          const converter = await loadXlsxConverter(xlsx)
          downloadFile(converter.nativeToXlsx(text), xlsxFilename(filename), XLSX_MIME_TYPE)
        },
      })}><Trans>Download as Excel (.xlsx)</Trans></button>}
      <label className="workbook-file-picker"><Trans>Open workbook</Trans>
        <input type="file" disabled={state.busy}
          accept={xlsx ? `.json,application/json,.xlsx,${XLSX_MIME_TYPE}` : '.json,application/json'}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            const confirmed = window.confirm(t`Open this file and replace the current workbook? Download first to keep unsaved changes.`)
            const read = xlsx && isXlsxFile(file)
              ? async () => (await loadXlsxConverter(xlsx)).xlsxToNative(
                new Uint8Array(await file.arrayBuffer()), workbookTitleOf(file))
              : () => file.text()
            void run({ action: 'open', confirmed, size: file.size, read })
          }} />
      </label>
      <button type="button" disabled={state.busy} onClick={() => void run({ action: 'new',
        confirmed: window.confirm(t`Create a blank workbook and replace the current workbook? Download first to keep unsaved changes.`),
      })}><Trans>New blank workbook</Trans></button>
      <p className="workbook-file-hint">{xlsx
        ? <Trans>Opens .einfach.json and .xlsx files up to 64 MiB. XLSX keeps values,
          formulas, formatting, merges, frozen panes, sizes, hidden rows and columns, links,
          notes, names, data validation, conditional formatting and tables; images, charts and
          other features are not converted. Opening or creating a workbook replaces this view
          and starts a fresh Undo history.
        </Trans>
        : <Trans>Native .einfach.json files only, up to 64 MiB. Not XLSX.
          Opening or creating a workbook replaces this view and starts a fresh Undo history.
        </Trans>}</p>
      {state.message && <p role={state.error ? 'alert' : 'status'}>{translateFeedback(i18n, state.message)}</p>}
      <button type="button" className="workbook-file-close" disabled={state.busy}
        onClick={() => void run({ action: 'close' })}><Trans>Close</Trans></button>
    </dialog>
  </>
}
