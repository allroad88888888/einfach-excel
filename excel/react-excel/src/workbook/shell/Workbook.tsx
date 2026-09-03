import { WorkbookGrid } from '../grid/viewport/WorkbookGrid'
import { FormulaBar } from '../chrome/formula-bar/FormulaBar'
import { WorkbookFooter } from '../chrome/footer/WorkbookFooter'
import { WorkbookHeader } from '../chrome/header/WorkbookHeader'
import { WorkbookRibbon } from '../chrome/ribbon/WorkbookRibbon'
import './workbook.css'

/** Composes the Rust-backed projection with the workbook chrome. */
export function Workbook() {
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
