import type { ComponentType } from 'react'
import { PageSalesOrders } from './sales-orders/PageSalesOrders'

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
])

export function demoPageHref(id: string): string {
  return `?demo=${encodeURIComponent(id)}`
}

export function resolveDemoPage(search: string): DemoPageRegistration {
  const requestedId = new URLSearchParams(search).get('demo')
  return DEMO_PAGES.find(({ id }) => id === requestedId) ?? DEMO_PAGES[0]!
}
