import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PageSidebar } from '../../../src/page/PageSidebar'
import { WorkbookRuntimeProvider } from '../../../src/page/WorkbookRuntimeProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { PLAIN_SALES_ORDERS } from './workbook'
import '../../../src/app/app.css'
import '../../../src/page/demo-page.css'

// 只替换导入数据；视图、隔离 Store、Worker 和 WASM 全部使用产品实现。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="demo-page">
      <PageSidebar activeDemoId="sales-orders" />
      <main id="demo-content" className="demo-page__content" aria-label="工作簿演示内容">
        <WorkbookRuntimeProvider definition={PLAIN_SALES_ORDERS}>
          <WorkbookView />
        </WorkbookRuntimeProvider>
      </main>
    </div>
  </StrictMode>,
)
