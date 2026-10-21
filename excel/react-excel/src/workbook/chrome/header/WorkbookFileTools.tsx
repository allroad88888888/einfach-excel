import { translateFeedback } from '../../../i18n/translate-feedback'
import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { workbookFilePanelAtom, runWorkbookFileAtom } from '@einfach/spreadsheet-ui-core'
import './workbook-file.css'
import { Trans, useLingui } from '@lingui/react/macro'
import { cycleDialogFocus } from '../ribbon/dialog-focus'

/** 原生文件入口：DOM 负责文件选择、替换确认、下载与模态焦点。 */
export function WorkbookFileTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(workbookFilePanelAtom)
  const run = useSetAtom(runWorkbookFileAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
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
    <dialog ref={dialogRef} className="workbook-file-dialog" aria-labelledby="workbook-file-title"
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run({ action: 'close' }) }}>
      <h2 id="workbook-file-title"><Trans>Workbook files</Trans></h2>
      <p><Trans>Your workbook is in memory. Download a file to keep your changes.</Trans></p>
      <button type="button" disabled={state.busy} onClick={() => void run({
        action: 'download', write: async ({ text, filename }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
          const anchor = document.createElement('a')
          anchor.href = url; anchor.download = filename
          document.body.append(anchor); anchor.click(); anchor.remove()
          // 给浏览器下载任务一个读取 Blob 的机会，随后回收临时地址。
          window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        },
      })}><Trans>Download workbook</Trans></button>
      <label className="workbook-file-picker"><Trans>Open workbook</Trans>
        <input type="file" accept=".json,application/json" disabled={state.busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            const confirmed = window.confirm(t`Open this file and replace the current workbook? Download first to keep unsaved changes.`)
            void run({ action: 'open', confirmed, size: file.size, read: () => file.text() })
          }} />
      </label>
      <button type="button" disabled={state.busy} onClick={() => void run({ action: 'new',
        confirmed: window.confirm(t`Create a blank workbook and replace the current workbook? Download first to keep unsaved changes.`),
      })}><Trans>New blank workbook</Trans></button>
      <p className="workbook-file-hint"><Trans>Native .einfach.json files only, up to 64 MiB. Not XLSX.
        Opening or creating a workbook replaces this view and starts a fresh Undo history.
      </Trans></p>
      {state.message && <p role={state.error ? 'alert' : 'status'}>{translateFeedback(i18n, state.message)}</p>}
      <button type="button" className="workbook-file-close" disabled={state.busy}
        onClick={() => void run({ action: 'close' })}><Trans>Close</Trans></button>
    </dialog>
  </>
}
