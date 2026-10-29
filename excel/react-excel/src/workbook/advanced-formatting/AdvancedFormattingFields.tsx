import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type TextMatchRule } from '@einfach-excel/spreadsheet-ui-core'

/** These controls edit the existing native draft; all matching stays in Rust. */
export function AdvancedFormattingFields({ idPrefix }: { idPrefix: string }) {
  const { t } = useLingui()
  const { rule } = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  if (rule.kind === 'text') {
    const wildcard = rule.condition === 'matches-wildcard' || rule.condition === 'not-matches-wildcard'
    return <>
      <label htmlFor={`${idPrefix}-condition`}><Trans>Text condition</Trans></label>
      <select id={`${idPrefix}-condition`} value={rule.condition}
        onChange={(event) => void run({ type: 'draft', rule: {
          condition: event.currentTarget.value as TextMatchRule['condition'],
        } })}>
        <option value="contains"><Trans>Contains</Trans></option>
        <option value="not-contains"><Trans>Does not contain</Trans></option>
        <option value="begins-with"><Trans>Begins with</Trans></option>
        <option value="ends-with"><Trans>Ends with</Trans></option>
        <option value="matches-wildcard"><Trans>Matches wildcard</Trans></option>
        <option value="not-matches-wildcard"><Trans>Does not match wildcard</Trans></option>
      </select>
      <label htmlFor={`${idPrefix}-match-text`}><Trans>Matching text</Trans></label>
      <input id={`${idPrefix}-match-text`} value={rule.text} spellCheck={false}
        aria-describedby={`${idPrefix}-text-help`}
        onChange={(event) => void run({ type: 'draft', rule: { text: event.currentTarget.value } })} />
      <p id={`${idPrefix}-text-help`}>{wildcard
        ? t`Matches the whole text, ignoring case. * matches any text, ? matches one Unicode character, and ~ escapes *, ? or ~. Spaces are kept.`
        : t`Matches literal text, ignoring case. Spaces are kept; * and ? are ordinary characters.`}</p>
    </>
  }
  if (rule.kind !== 'duplicate-values') return null
  return <>
    <label htmlFor={`${idPrefix}-duplicates`}><Trans>Highlight values</Trans></label>
    <select id={`${idPrefix}-duplicates`} value={rule.mode}
      onChange={(event) => void run({ type: 'draft', rule: {
        mode: event.currentTarget.value === 'unique' ? 'unique' : 'duplicate',
      } })}>
      <option value="duplicate"><Trans>Duplicate</Trans></option>
      <option value="unique"><Trans>Unique</Trans></option>
    </select>
    <label htmlFor={`${idPrefix}-compare-by`}><Trans>Compare by</Trans></label>
    <select id={`${idPrefix}-compare-by`} value={rule.compareBy ?? 'value'}
      onChange={(event) => void run({ type: 'draft', rule: {
        compareBy: event.currentTarget.value === 'display-text' ? 'display-text' : 'value',
      } })}>
      <option value="value"><Trans>Original value and type</Trans></option>
      <option value="display-text"><Trans>Base display text</Trans></option>
    </select>
    <p>{rule.compareBy === 'display-text'
      ? t`Compares native base display text across all applied ranges, ignoring text case. Number formats are included; conditional formatting is excluded. Blank cells, empty text and errors are skipped.`
      : t`Compares calculated values across all applied ranges, ignoring text case. Blank cells, empty text and errors are skipped; numbers and text are different.`}</p>
  </>
}
