import { DEMO_PAGES, demoPageHref } from './demo/demo-registry'
import './page-sidebar.css'

function WorkbookIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8h14M8 3v14" />
    </svg>
  )
}

export interface PageSidebarProps {
  readonly activeDemoId: string
}

/** Renders every registered workbook demo as product navigation. */
export function PageSidebar({ activeDemoId }: PageSidebarProps) {
  return (
    <aside className="page-sidebar" aria-label="产品导航">
      <nav className="page-sidebar__nav" aria-label="工作簿菜单">
        <ul className="page-menu">
          <li>
            <div className="page-menu__group">
              <WorkbookIcon />
              <span>工作簿</span>
              <span className="page-menu__chevron" aria-hidden="true">
                ⌄
              </span>
            </div>
            <ul className="page-menu__children">
              {DEMO_PAGES.map((demo) => (
                <li key={demo.id}>
                  <a
                    className="page-menu__item"
                    href={demoPageHref(demo.id)}
                    aria-current={demo.id === activeDemoId ? 'page' : undefined}
                  >
                    <span className="page-menu__file-mark" aria-hidden="true">
                      {demo.marker}
                    </span>
                    <span className="page-menu__item-label">{demo.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
