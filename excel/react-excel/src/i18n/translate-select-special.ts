import { t } from '@lingui/core/macro'
import type { I18n } from '@lingui/core'
import { translateFeedback } from './translate-feedback'

/** 含数字或地址的成功提示；其余交给通用词典。 */
export function translateSelectSpecial(i18n: I18n, message: string): string {
  let match = /^Selected (\d+) visible cells in (\d+) areas\.$/.exec(message)
  if (match) {
    const [, cells, areas] = match
    return t(i18n)`Selected ${cells} visible cells in ${areas} areas.`
  }
  match = /^Selected current region (.+)\.$/.exec(message)
  if (match) {
    const range = match[1]
    return t(i18n)`Selected current region ${range}.`
  }
  return translateFeedback(i18n, message)
}
