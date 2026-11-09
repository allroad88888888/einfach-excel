import type { Messages } from '@lingui/core'

export const labels = {
  sparkline: { id: 'plugin.sparkline.kind', message: 'Sparkline' },
  group: { id: 'plugin.sparkline.group', message: 'Sparklines' },
  create: { id: 'plugin.sparkline.create', message: 'Create sparklines' },
  data: { id: 'plugin.sparkline.data', message: 'Data range' },
  location: { id: 'plugin.sparkline.location', message: 'Location range' },
  ok: { id: 'plugin.sparkline.ok', message: 'OK' },
  cancel: { id: 'plugin.sparkline.cancel', message: 'Cancel' },
  close: { id: 'plugin.sparkline.close', message: 'Close' },
  type: { id: 'plugin.sparkline.type', message: 'Sparkline type' },
  color: { id: 'plugin.sparkline.color', message: 'Sparkline color' },
  markerColor: { id: 'plugin.sparkline.markerColor', message: 'Marker color' },
  remove: { id: 'plugin.sparkline.remove', message: 'Clear sparklines' },
  high: { id: 'plugin.sparkline.high', message: 'High point' },
  low: { id: 'plugin.sparkline.low', message: 'Low point' },
  first: { id: 'plugin.sparkline.first', message: 'First point' },
  last: { id: 'plugin.sparkline.last', message: 'Last point' },
  negative: { id: 'plugin.sparkline.negative', message: 'Negative points' },
  markers: { id: 'plugin.sparkline.markers', message: 'Markers' },
  axis: { id: 'plugin.sparkline.axis', message: 'Show axis' },
}
export const typeLabels = {
  line: { id: 'plugin.sparkline.type.line', message: 'Line' },
  column: { id: 'plugin.sparkline.type.column', message: 'Column' },
  winLoss: { id: 'plugin.sparkline.type.winLoss', message: 'Win/Loss' },
}
const errors: Record<string, string> = {
  'Enter a valid data range.': '请输入有效的数据区域。',
  'Enter a valid location range.': '请输入有效的位置区域。',
  'The location range must be a single row or column.': '位置区域必须是一行或一列。',
  'A sparkline group can have at most 1000 sparklines.': '一组迷你图最多 1000 个。',
  'The data range does not match the number of sparkline cells.': '数据区域与位置单元格数量不匹配。',
  'A sparkline can show at most 1000 points.': '一个迷你图最多 1000 个点。',
  'The location already has sparklines.': '位置区域已有迷你图。',
  'The sparklines could not be created.': '无法创建迷你图。',
  'A worksheet can hold at most 1000 objects.': '一张工作表最多 1000 个对象。',
}
const zh: Record<string, string> = {
  sparkline: '迷你图', group: '迷你图', create: '创建迷你图', data: '数据区域',
  location: '位置范围', ok: '确定', cancel: '取消', close: '关闭', type: '迷你图类型',
  color: '迷你图颜色', markerColor: '标记颜色', remove: '清除迷你图', high: '高点', low: '低点',
  first: '首点', last: '尾点', negative: '负点', markers: '标记', axis: '显示坐标轴',
}
const zhTypes = { line: '折线', column: '柱形', winLoss: '盈亏' }
const all = [...Object.values(labels), ...Object.values(typeLabels)]
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: { ...Object.fromEntries(Object.keys(errors).map((key) => [key, key])),
    ...Object.fromEntries(all.map(({ id, message }) => [id, message])) },
  zh: { ...errors,
    ...Object.fromEntries(Object.entries(zh).map(([key, text]) =>
      [labels[key as keyof typeof labels].id, text])),
    ...Object.fromEntries(Object.entries(zhTypes).map(([key, text]) =>
      [typeLabels[key as keyof typeof typeLabels].id, text])) },
}
