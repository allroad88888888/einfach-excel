/** Existing Worker tests have no async calls; expose the native queue's empty contract. */
export class EmptyAsyncFormulaWorkbook {
  read_custom_formulas = () => '[]'
  registerCustomFormulaAsync = () => undefined
  drainAsyncCustomRequests = () => []
  resolveAsyncCustomCall = () => false
}
