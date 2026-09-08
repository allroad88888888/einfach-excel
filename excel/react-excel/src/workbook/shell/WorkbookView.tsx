import { FormulaBar } from '../chrome/formula-bar/FormulaBar'
import { WorkbookFooter } from '../chrome/footer/WorkbookFooter'
import { WorkbookHeader } from '../chrome/header/WorkbookHeader'
import { WorkbookRibbon } from '../chrome/ribbon/WorkbookRibbon'
import { WorkbookGrid } from '../grid/viewport/WorkbookGrid'
import './workbook.css'
import { useSetAtom } from '@einfach/react'
import { runFindReplaceAtom } from '@einfach/spreadsheet-ui-core'

/** Composes the shared spreadsheet chrome around the active Rust workbook. */
export function WorkbookView() {
  const runFind = useSetAtom(runFindReplaceAtom)
  return (
    <div
      className="workbook"
      data-runtime-state="ready"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.altKey || !(event.ctrlKey || event.metaKey))
          return
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, [contenteditable="true"]')
        )
          return
        const key = event.key.toLowerCase()
        if (key !== 'f' && key !== 'h') return
        event.preventDefault()
        void runFind({ open: key === 'h' ? 'replace' : 'find' })
      }}
    >
      <WorkbookHeader />
      <div className="rust-runtime-status" role="status">
        Rust/WASM ready
      </div>
      <WorkbookRibbon />
      <FormulaBar />
      <WorkbookGrid />
      <WorkbookFooter />
    </div>
  )
}
