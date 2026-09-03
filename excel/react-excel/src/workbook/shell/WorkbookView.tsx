import { FormulaBar } from '../chrome/formula-bar/FormulaBar'
import { WorkbookFooter } from '../chrome/footer/WorkbookFooter'
import { WorkbookHeader } from '../chrome/header/WorkbookHeader'
import { WorkbookRibbon } from '../chrome/ribbon/WorkbookRibbon'
import { WorkbookGrid } from '../grid/viewport/WorkbookGrid'
import './workbook.css'

/** Composes the shared spreadsheet chrome around the active Rust workbook. */
export function WorkbookView() {
  return (
    <div className="workbook" data-runtime-state="ready">
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
