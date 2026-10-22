import { FormulaBar } from '../chrome/formula-bar/FormulaBar'
import { WorkbookFooter } from '../chrome/footer/WorkbookFooter'
import { WorkbookHeader } from '../chrome/header/WorkbookHeader'
import { WorkbookRibbon } from '../chrome/ribbon/WorkbookRibbon'
import { WorkbookGrid } from '../grid/viewport/WorkbookGrid'
import './workbook.css'
import '../../style.css'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runFindReplaceAtom, formatPainterAtom, runFormatPainterAtom,
  runGoToReferenceAtom } from '@einfach/spreadsheet-ui-core'
import { Trans, useLingui } from '@lingui/react/macro'

/** Composes the shared spreadsheet chrome around the active Rust workbook. */
export function WorkbookView() {
  const { i18n } = useLingui()
  const runFind = useSetAtom(runFindReplaceAtom)
  const runGoTo = useSetAtom(runGoToReferenceAtom)
  const painter = useAtomValue(formatPainterAtom)
  const runPainter = useSetAtom(runFormatPainterAtom)
  return (
    <div
      className="einfach-spreadsheet workbook"
      lang={i18n.locale}
      data-runtime-state="ready"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && painter.mode !== 'idle') {
          event.preventDefault()
          void runPainter('exit')
        }
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.altKey)
          return
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, [contenteditable="true"], dialog')
        )
          return
        const key = event.key.toLowerCase()
        if (!event.shiftKey && ((key === 'f5' && !event.ctrlKey && !event.metaKey) ||
          ((event.ctrlKey || event.metaKey) && key === 'g'))) {
          if (runGoTo('open')) event.preventDefault()
          return
        }
        if (!(event.ctrlKey || event.metaKey)) return
        if (key !== 'f' && key !== 'h') return
        event.preventDefault()
        void runFind({ open: key === 'h' ? 'replace' : 'find' })
      }}
    >
      <WorkbookHeader />
      <div className="rust-runtime-status" role="status"><Trans>
        Rust/WASM ready
      </Trans></div>
      <WorkbookRibbon />
      <FormulaBar />
      <WorkbookGrid />
      <WorkbookFooter />
    </div>
  )
}
