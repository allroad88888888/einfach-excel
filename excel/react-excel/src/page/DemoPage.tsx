import { PageSidebar } from './PageSidebar'
import { resolveDemoPage } from './demo/demo-registry'
import './demo-page.css'

/** Renders the demo navigation beside the selected workbook. */
export function DemoPage() {
  const activeDemo = resolveDemoPage(window.location.search)
  const ActivePage = activeDemo.Page

  return (
    <div className="demo-page">
      <PageSidebar activeDemoId={activeDemo.id} />
      <main id="demo-content" className="demo-page__content" aria-label="工作簿演示内容">
        <ActivePage />
      </main>
    </div>
  )
}
