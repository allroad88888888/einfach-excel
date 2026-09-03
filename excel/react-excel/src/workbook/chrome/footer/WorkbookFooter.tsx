import { useAtomValue } from '@einfach/react'
import { selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { SALES_ORDER_RECORD_COUNT } from '../../../product/sales-orders/data/sheet'
import './footer.css'

/** Renders workbook sheet navigation and status information. */
export function WorkbookFooter() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <footer className="workbook-footer">
      <div className="sheet-tabs" aria-label="Workbook sheets">
        <button className="sheet-nav" type="button" aria-label="Previous sheet">
          ‹
        </button>
        <button className="sheet-nav" type="button" aria-label="Next sheet">
          ›
        </button>
        <button className="add-sheet" type="button" aria-label="New sheet">
          ＋
        </button>
        <button className="sheet-tab active" type="button">
          <span aria-hidden="true" /> Sales Orders
        </button>
      </div>
      <div className="status-items">
        <span className="record-status">{SALES_ORDER_RECORD_COUNT.toLocaleString()} records</span>
        <span>Count: {selectedCellCount}</span>
        <div className="zoom-control" aria-label="Zoom 100 percent">
          <button type="button" aria-label="Zoom out">
            −
          </button>
          <span className="zoom-track" aria-hidden="true">
            <span />
          </span>
          <span>100%</span>
          <button type="button" aria-label="Zoom in">
            ＋
          </button>
        </div>
      </div>
    </footer>
  )
}
