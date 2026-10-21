import type { ConditionalFormatRule } from '../conditional-formatting/types'

/** Validate editable text only; no TypeScript matching or workbook-value evaluation. */
export function advancedFormattingDraftError(rule: ConditionalFormatRule): string | null {
  if (rule.kind !== 'text') return null
  const characters = Array.from(rule.text)
  if (characters.length === 0 || characters.length > 1024)
    return 'Enter text between 1 and 1024 characters.'
  if (rule.condition !== 'matches-wildcard' && rule.condition !== 'not-matches-wildcard') return null
  let trailingEscapes = 0
  for (let index = characters.length - 1; index >= 0 && characters[index] === '~'; index--)
    trailingEscapes++
  return trailingEscapes % 2 === 0 ? null : 'Finish the wildcard escape with *, ? or ~.'
}
