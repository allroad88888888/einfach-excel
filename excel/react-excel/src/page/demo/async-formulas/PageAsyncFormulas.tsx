import { WorkbookRuntimeProvider } from '../../WorkbookRuntimeProvider'
import { WorkbookView } from '../../../workbook/shell/WorkbookView'
import { ASYNC_FORMULAS_WORKBOOK } from './async-formulas-workbook'

/** Mounts the JSON extension examples through the product Worker and workbook view. */
export function PageAsyncFormulas() {
  return <WorkbookRuntimeProvider definition={ASYNC_FORMULAS_WORKBOOK}>
    <WorkbookView />
  </WorkbookRuntimeProvider>
}
