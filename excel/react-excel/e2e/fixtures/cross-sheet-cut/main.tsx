import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PageSidebar } from '../../../src/page/PageSidebar'
import { WorkbookRuntimeProvider } from '../../../src/page/WorkbookRuntimeProvider'
import { CROSS_SHEET_CUT_WORKBOOK } from '../../../src/page/demo/cross-sheet-cut/cross-sheet-cut-workbook'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import '../../../src/app/app.css'
import '../../../src/page/demo-page.css'

// Only the workbook definition differs; DOM, Core, Worker and WASM remain the product path.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="demo-page">
      <PageSidebar activeDemoId="sales-orders" />
      <main id="demo-content" className="demo-page__content" aria-label="工作簿演示内容">
        <WorkbookRuntimeProvider definition={CROSS_SHEET_CUT_WORKBOOK}>
          <WorkbookView />
        </WorkbookRuntimeProvider>
      </main>
    </div>
  </StrictMode>,
)
