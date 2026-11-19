import type { MessageDescriptor, Messages } from '@lingui/core'

const pairs = {
  title: ['Consolidate', '合并计算'],
  function: ['Function', '函数'],
  reference: ['Reference', '引用位置'],
  referencePlaceholder: ['e.g. Sheet1!A1:C5 or NamedRange', '例如 Sheet1!A1:C5 或命名区域'],
  add: ['Add', '添加'],
  allReferences: ['All references', '所有引用位置'],
  remove: ['Delete', '删除'],
  destination: ['Destination', '目标位置'],
  useLabels: ['Use labels in', '标签位置'],
  topRow: ['Top row', '首行'],
  leftColumn: ['Left column', '最左列'],
  createLinks: ['Create links to source data', '创建指向源数据的链接'],
  preview: ['Preview', '预览'],
  apply: ['Consolidate', '合并计算'],
  cancel: ['Cancel', '取消'],
  working: ['Working…', '处理中…'],
  previewHeading: ['Preview', '预览结果'],
  previewSummary: ['Output: {rows} × {cols}', '输出范围：{rows} 行 × {cols} 列'],
  previewTruncated: ['Showing up to 6 × 6 cells', '仅展示前 6 × 6 单元格样本'],
  confirmOverwrite: [
    'Overwrite {count} existing cells at the destination',
    '确认覆盖目标区域中的 {count} 个已有单元格',
  ],
  sum: ['Sum', '求和'],
  count: ['Count', '计数'],
  average: ['Average', '平均值'],
  max: ['Max', '最大值'],
  min: ['Min', '最小值'],
  product: ['Product', '乘积'],
  countNumbers: ['Count numbers', '数值计数'],
  sampleStandardDeviation: ['StdDev', '标准偏差'],
  populationStandardDeviation: ['StdDevp', '总体标准偏差'],
  sampleVariance: ['Var', '方差'],
  populationVariance: ['Varp', '总体方差'],
  errSourcesCount: [
    'Add between 1 and 32 source ranges to consolidate.',
    '请添加 1 到 32 个来源区域后再进行合并计算。',
  ],
  errInvalidRef: [
    'Enter valid worksheet references for every source range.',
    '请为每个来源区域输入有效的工作表引用。',
  ],
  errDestination: [
    'Choose a destination cell within the worksheet.',
    '请在工作表范围内选择有效的目标单元格。',
  ],
  errSameSheetLinks: [
    'Create links to source data requires sources on other worksheets.',
    '创建指向源数据的链接要求所有来源区域位于其他工作表。',
  ],
  errTopRow: [
    'Each source needs a top label row and at least one data row.',
    '启用首行标签时，每个来源区域至少需要包含 1 行标题和 1 行数据。',
  ],
  errLeftColumn: [
    'Each source needs a left label column and at least one data column.',
    '启用最左列标签时，每个来源区域至少需要包含 1 列标签和 1 列数据。',
  ],
  errNoData: [
    'No matching labels or data cells were found in the source ranges.',
    '来源区域中未找到可合并的标签或数据单元格。',
  ],
  errMaxCells: [
    'Choose source ranges of at most 100,000 cells each.',
    '每个来源区域最多包含 100,000 个单元格。',
  ],
  errOutputMaxCells: [
    'The consolidated output exceeds the 100,000-cell limit.',
    '合并计算的输出范围超过 100,000 个单元格上限。',
  ],
  errRowLimit: [
    'The consolidated output exceeds the worksheet row limit.',
    '合并计算的输出范围超出工作表最大行数。',
  ],
  errColLimit: [
    'The consolidated output exceeds the worksheet column limit.',
    '合并计算的输出范围超出工作表最大列数。',
  ],
  errTables: [
    'Choose a destination outside existing Tables.',
    '请在现有表格之外选择合并计算目标位置。',
  ],
  errMergeSpill: [
    'Choose a destination without merged cells or spilled formulas.',
    '请选择不含合并单元格或溢出公式的目标位置。',
  ],
  errFilter: [
    'Choose a destination outside an active filter range.',
    '请在当前筛选区域之外选择合并计算目标位置。',
  ],
  errSubtotal: [
    'Choose a destination outside an existing subtotal list.',
    '请在现有分类汇总列表之外选择合并计算目标位置。',
  ],
  errOutlineOverlap: [
    'Clear overlapping row outline groups at the destination first.',
    '请先清除目标区域重叠的行分级大纲。',
  ],
  errOutlineLimit: [
    'The consolidated links exceed the worksheet outline limit.',
    '合并链接生成的分级大纲超出工作表上限。',
  ],
  errConfirmOverwrite: [
    'Confirm overwriting the occupied destination cells before consolidating.',
    '执行合并计算前，请先确认覆盖目标区域已有内容。',
  ],
  errWorkbookChanged: [
    'The workbook changed. Preview the consolidated output again.',
    '工作簿已变更，请重新预览合并结果。',
  ],
  errMissingSourceSheet: [
    'One of the source worksheets no longer exists.',
    '某个来源工作表已不存在。',
  ],
} as const

type Label = keyof typeof pairs

export const consolidateLabels = Object.fromEntries(
  Object.entries(pairs).map(([id, [message]]) => [id, { id: `consolidate.${id}`, message }]),
) as Record<Label, MessageDescriptor>

export const consolidateErrors = [
  consolidateLabels.errSourcesCount,
  consolidateLabels.errInvalidRef,
  consolidateLabels.errDestination,
  consolidateLabels.errSameSheetLinks,
  consolidateLabels.errTopRow,
  consolidateLabels.errLeftColumn,
  consolidateLabels.errNoData,
  consolidateLabels.errMaxCells,
  consolidateLabels.errOutputMaxCells,
  consolidateLabels.errRowLimit,
  consolidateLabels.errColLimit,
  consolidateLabels.errTables,
  consolidateLabels.errMergeSpill,
  consolidateLabels.errFilter,
  consolidateLabels.errSubtotal,
  consolidateLabels.errOutlineOverlap,
  consolidateLabels.errOutlineLimit,
  consolidateLabels.errConfirmOverwrite,
  consolidateLabels.errWorkbookChanged,
  consolidateLabels.errMissingSourceSheet,
] as const

function catalog(locale: 0 | 1): Messages {
  return Object.fromEntries(
    Object.entries(pairs).map(([id, values]) => [
      consolidateLabels[id as Label].id!,
      values[locale]
        .split(/(\{\w+\})/)
        .filter(Boolean)
        .map((part) => (part.startsWith('{') ? [part.slice(1, -1)] : part)),
    ]),
  ) as Messages
}

export const consolidateMessages = { en: catalog(0), zh: catalog(1) }
