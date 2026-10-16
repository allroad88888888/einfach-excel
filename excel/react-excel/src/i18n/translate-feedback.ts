import type { I18n } from '@lingui/core'
import { t } from '@lingui/core/macro'
import { feedbackMessages } from './feedback-messages'

/** 仅用于系统提示和函数说明，不能用于单元格值、名称等用户数据。 */
export function translateFeedback(i18n: I18n, message: string | null | undefined): string {
  if (!message) return ''
  const descriptor = Object.hasOwn(feedbackMessages, message)
    ? feedbackMessages[message] : undefined
  if (descriptor) return i18n._(descriptor)
  // 只识别当前 Core 已有的完整消息格式；参数保持原值，不对任意字符串做替换。
  let match = /^Copied (\d+) × (\d+) cells(?: as (text|markdown|html))?\.$/.exec(message)
  if (match) {
    const [, rows, cols, format] = match
    return format ? t(i18n)`Copied ${rows} × ${cols} cells as ${format}.`
      : t(i18n)`Copied ${rows} × ${cols} cells.`
  }
  match = /^(\d+) × (\d+) cells ready to move\. Paste to finish\.$/.exec(message)
  if (match) {
    const [, rows, cols] = match
    return t(i18n)`${rows} × ${cols} cells ready to move. Paste to finish.`
  }
  match = /^Sorted (\d+) rows\.$/.exec(message)
  if (match) { const rows = match[1]; return t(i18n)`Sorted ${rows} rows.` }
  match = /^(\d+) rows filtered out\.$/.exec(message)
  if (match) { const rows = match[1]; return t(i18n)`${rows} rows filtered out.` }
  match = /^Table (.+)\. (\d+) rows filtered out in this worksheet\.$/.exec(message)
  if (match) {
    const [, table, rows] = match
    return t(i18n)`Table ${table}. ${rows} rows filtered out in this worksheet.`
  }
  match = /^Table (.+) filter cleared\. Manually hidden rows are unchanged\.$/.exec(message)
  if (match) {
    const table = match[1]
    return t(i18n)`Table ${table} filter cleared. Manually hidden rows are unchanged.`
  }
  match = /^Replaced (\d+) occurrence\(s\) in (\d+) cell\(s\)\. Find next to continue\.$/.exec(message)
  if (match) {
    const [, occurrences, cells] = match
    return t(i18n)`Replaced ${occurrences} occurrence(s) in ${cells} cell(s). Find next to continue.`
  }
  match = /^(Worksheet|Workbook) recalculated \((\d+) formulas\)\.$/.exec(message)
  if (match) {
    const count = match[2]
    return match[1] === 'Worksheet' ? t(i18n)`Worksheet recalculated (${count} formulas).`
      : t(i18n)`Workbook recalculated (${count} formulas).`
  }
  match = /^Copied (Count|Numerical count|Sum|Average|Min|Max)\.$/.exec(message)
  if (match) { const label = translateFeedback(i18n, match[1]); return t(i18n)`Copied ${label}.` }
  match = /^(Filling|Filled) (down|right)(…|\.)$/.exec(message)
  if (match) return match[1] === 'Filling'
    ? (match[2] === 'down' ? t(i18n)`Filling down…` : t(i18n)`Filling right…`)
    : (match[2] === 'down' ? t(i18n)`Filled down.` : t(i18n)`Filled right.`)
  match = /^Enter a whole number from (\d+) to (\d+) pixels\.$/.exec(message)
  if (match) { const [, min, max] = match; return t(i18n)`Enter a whole number from ${min} to ${max} pixels.` }
  match = /^Selected (\d+) cells in (\d+) areas\. Searched (.+)\.$/.exec(message)
  if (match) {
    const [, cells, areas, range] = match
    return t(i18n)`Selected ${cells} cells in ${areas} areas. Searched ${range}.`
  }
  match = /^(.+)\. Argument help is not available yet\.$/.exec(message)
  if (match) {
    const category = translateFeedback(i18n, match[1])
    return t(i18n)`${category}. Argument help is not available yet.`
  }
  const kept = ' Current workbook kept.'
  if (message.endsWith(kept)) {
    const detail = translateFeedback(i18n, message.slice(0, -kept.length))
    return t(i18n)`${detail} Current workbook kept.`
  }
  const capture = 'Could not capture formatting: '
  if (message.startsWith(capture)) {
    const detail = translateFeedback(i18n, message.slice(capture.length))
    return t(i18n)`Could not capture formatting: ${detail}`
  }
  // 未知错误不能被吞掉或伪装成成功；保留诊断原文。
  return message
}
