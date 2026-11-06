import type { ComponentType } from 'react'
import { PageSalesOrders } from './sales-orders/PageSalesOrders'
import { PageAsyncFormulas } from './async-formulas/PageAsyncFormulas'
import { PageLocalRestore } from './local-restore/PageLocalRestore'
import { PageCharts } from './charts/PageCharts'

export interface DemoPageRegistration {
  readonly id: string
  readonly marker: string
  readonly title: string
  readonly Page: ComponentType
}

/** Lists the workbook demos exposed by the standalone React application. */
export const DEMO_PAGES: readonly DemoPageRegistration[] = Object.freeze([
  {
    id: 'sales-orders',
    marker: 'S',
    title: 'Sales Orders',
    Page: PageSalesOrders,
  },
  {
    id: 'async-formulas',
    marker: 'A',
    title: 'Async formulas',
    Page: PageAsyncFormulas,
  },
  {
    id: 'local-restore',
    marker: 'R',
    title: 'Local restore',
    Page: PageLocalRestore,
  },
  {
    id: 'charts',
    marker: 'C',
    title: 'Charts',
    Page: PageCharts,
  },
])

export function demoPageHref(id: string): string {
  return `?demo=${encodeURIComponent(id)}`
}

export function resolveDemoPage(search: string): DemoPageRegistration {
  const requestedId = new URLSearchParams(search).get('demo')
  return DEMO_PAGES.find(({ id }) => id === requestedId) ?? DEMO_PAGES[0]!
}
