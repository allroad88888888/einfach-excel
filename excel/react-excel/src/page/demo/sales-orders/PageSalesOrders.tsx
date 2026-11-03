import { WorkbookRuntimeProvider } from '../../WorkbookRuntimeProvider'
import { WorkbookView } from '../../../workbook/shell/WorkbookView'
import { SALES_ORDERS_DEMO_DEFINITION } from './sales-orders-workbook'
import { demoPresentation } from '../demo-presentation'

/** Renders the Sales Orders workbook through the shared React presentation. */
export function PageSalesOrders() {
  return (
    <WorkbookRuntimeProvider definition={SALES_ORDERS_DEMO_DEFINITION} {...demoPresentation()}>
      <WorkbookView />
    </WorkbookRuntimeProvider>
  )
}
