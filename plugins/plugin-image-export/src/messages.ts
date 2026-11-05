import type { Messages } from '@lingui/core'

export const labels = {
  title: { id: 'plugin.imageExport.title', message: 'Export selection as image' },
  hint: { id: 'plugin.imageExport.hint', message: 'Export the selected cells as PNG. Hidden rows and columns are omitted.' },
  scale: { id: 'plugin.imageExport.scale', message: 'Image scale' },
  copy: { id: 'plugin.imageExport.copy', message: 'Copy PNG' },
  download: { id: 'plugin.imageExport.download', message: 'Download PNG' },
  close: { id: 'plugin.imageExport.close', message: 'Close' },
  busy: { id: 'plugin.imageExport.busy', message: 'Preparing image…' },
  success: { id: 'plugin.imageExport.success', message: 'Image exported.' },
}
const errors: Record<string, string> = {
  'Choose one continuous range.': '请选择一个连续区域。',
  'Choose at most 65,536 cells for image export.': '图片导出最多选择 65,536 个单元格。',
  'The image exceeds 16 megapixels. Choose a smaller range or scale.': '图片超过 1600 万像素，请缩小区域或比例。',
  'Include each merged cell completely in the export range.': '导出区域需完整包含相交的合并单元格。',
  'The selected range has no visible cells.': '选区中没有可见单元格。',
  'Image clipboard is unavailable. Download the PNG instead.': '当前环境不支持图片剪贴板，请下载 PNG。',
  'Image encoding failed.': '图片编码失败。',
  'The workbook is not ready.': '工作簿尚未准备好。',
  'Choose a range inside the worksheet.': '请选择工作表内的区域。',
  'The workbook changed. Open image export again.': '工作簿已改变，请重新打开图片导出。',
  'Rust returned an incomplete display range.': '读取的区域不完整，请重试。',
}
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: { ...Object.fromEntries(Object.keys(errors).map((key) => [key, key])),
    ...Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, message])) },
  zh: { ...errors,
    [labels.title.id]: '导出选区为图片',
    [labels.hint.id]: '将选中的单元格导出为 PNG，跳过隐藏行列。',
    [labels.scale.id]: '图片比例', [labels.copy.id]: '复制 PNG',
    [labels.download.id]: '下载 PNG', [labels.close.id]: '关闭',
    [labels.busy.id]: '正在准备图片…', [labels.success.id]: '图片已导出。',
  },
}
