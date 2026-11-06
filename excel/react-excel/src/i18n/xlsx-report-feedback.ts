import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** XLSX 导入/导出转换报告中各项特性的本地化词条。 */
export const xlsxReportFeedback: Readonly<Record<string, MessageDescriptor>> = {
  '1904 date system': msg`1904 date system`,
  'images or drawings': msg`images or drawings`,
  charts: msg`charts`,
  'chart series names': msg`chart series names`,
  'waterfall subtotals': msg`waterfall subtotals`,
  'pivot tables': msg`pivot tables`,
  'threaded comments': msg`threaded comments`,
  'threaded comments exported as notes': msg`threaded comments exported as notes`,
  'unsupported conditional formats': msg`unsupported conditional formats`,
  'unsupported data validations': msg`unsupported data validations`,
  'unsupported defined names': msg`unsupported defined names`,
  'broken defined names': msg`broken defined names`,
  'unsupported hyperlinks': msg`unsupported hyperlinks`,
  'rich text formatting': msg`rich text formatting`,
  'table filters or totals': msg`table filters or totals`,
  'unsupported tables': msg`unsupported tables`,
  'row or column styles': msg`row or column styles`,
  'text rotation': msg`text rotation`,
  'sheet protection': msg`sheet protection`,
  'auto filters': msg`auto filters`,
  filters: msg`filters`,
  'outline grouping': msg`outline grouping`,
  'print settings': msg`print settings`,
  'custom formulas': msg`custom formulas`,
  'sheet visibility or tab colors': msg`sheet visibility or tab colors`,
  'theme fonts': msg`theme fonts`,
  'external links': msg`external links`,
  macros: msg`macros`,
}
