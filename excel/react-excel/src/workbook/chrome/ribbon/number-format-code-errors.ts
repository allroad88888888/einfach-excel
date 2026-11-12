import { msg } from '@lingui/core/macro'
import type { I18n, MessageDescriptor } from '@lingui/core'
import type { NumberFormatCodeError } from '@einfach-excel/spreadsheet-ui-core'

/** Rust 自定义格式代码错误码 → 可纠正的提示；React 只翻译，不解析代码。 */
const MESSAGES: Readonly<Record<NumberFormatCodeError, MessageDescriptor>> = {
  'empty': msg`Enter a format code, for example #,##0.00.`,
  'too-long': msg`Use at most 255 characters in a format code.`,
  'too-many-sections': msg`Use at most four sections separated by semicolons: positive;negative;zero;text.`,
  'unclosed-quote': msg`Close the quoted text with a matching double quote (").`,
  'unclosed-bracket': msg`Close the bracket with ] — for example [Red] or [>=100].`,
  'unknown-bracket': msg`Use a color such as [Red] or [Color10], a condition such as [>=100], or a currency tag such as [$¥-411] inside brackets.`,
  'incomplete-escape': msg`Add the character that follows \\, _ or * at the end of the code.`,
  'multiple-decimal-points': msg`Use only one decimal point in each section.`,
  'text-with-digits': msg`Put the text placeholder @ in a section without digit placeholders.`,
}

export function numberFormatCodeMessage(i18n: I18n, code: NumberFormatCodeError): string {
  return i18n._(MESSAGES[code])
}
