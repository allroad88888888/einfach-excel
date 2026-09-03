import { WorkbookRuntimeProvider } from '../../WorkbookRuntimeProvider'
import { WorkbookView } from '../../../workbook/shell/WorkbookView'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from './sales-orders-workbook'

/** Renders the Sales Orders workbook through the shared React presentation. */
export function PageSalesOrders() {
  return (
    <WorkbookRuntimeProvider definition={SALES_ORDERS_WORKBOOK_DEFINITION}>
      <WorkbookView />
    </WorkbookRuntimeProvider>
  )
}
