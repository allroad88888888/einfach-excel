import { expect, test } from 'vitest'
import { snapshotRule } from '../../src/conditional-formatting/snapshot-rules'
import { copyRule, freezeRule } from '../../src/conditional-formatting/value-domain'
import { conditionalFormatEditorDraftError } from '../../src/conditional-formatting/editor-draft'
import { advancedFormattingDraftError } from '../../src/advanced-formatting/draft'
import type { TextMatchRule } from '../../src/conditional-formatting/types'

const text = (value: string, condition: TextMatchRule['condition'] = 'matches-wildcard'): TextMatchRule => ({
  kind: 'text', condition, text: value, enabled: false, stopIfTrue: true, format: { bold: true },
})

test('wildcard and comparison fields survive snapshots, copies and freezes without a second matcher', () => {
  for (const input of [text('中文?'), text('a~*', 'not-matches-wildcard'),
    { kind: 'duplicate-values', mode: 'unique', compareBy: 'display-text', enabled: false,
      stopIfTrue: true, format: { bold: true } }]) {
    const rule = snapshotRule(input)
    expect(rule).toEqual(input)
    if (!rule) throw new Error('Rule missing')
    expect(copyRule(rule)).toEqual(input)
    expect(freezeRule(rule)).toEqual(input)
    expect(Object.isFrozen(freezeRule(rule))).toBe(true)
  }
})

test('legacy literal and raw-value rules preserve omitted compareBy and all original options', () => {
  for (const condition of ['contains', 'not-contains', 'begins-with', 'ends-with'] as const)
    expect(snapshotRule(text('*?~', condition))).toEqual(text('*?~', condition))
  const legacy = { kind: 'duplicate-values', mode: 'duplicate', format: { bold: true } }
  expect(snapshotRule(legacy)).toEqual(legacy)
  expect(snapshotRule({ ...legacy, compareBy: 'value' })).toEqual({ ...legacy, compareBy: 'value' })
})

test('malformed advanced wire fields are rejected without coercing modes or booleans', () => {
  for (const compareBy of ['formatted', '', null, 1, true])
    expect(snapshotRule({ kind: 'duplicate-values', mode: 'duplicate', compareBy, format: { bold: true } })).toBeNull()
  expect(snapshotRule({ ...text('*'), condition: 'regex' })).toBeNull()
  expect(snapshotRule({ ...text('*'), stopIfTrue: 'true' })).toBeNull()
})

test('invalid wildcard drafts remain snapshotable and return correctable errors through the editor', () => {
  for (const [value, error] of [
    ['', 'Enter text between 1 and 1024 characters.'],
    ['🙂'.repeat(1025), 'Enter text between 1 and 1024 characters.'],
    ['abc~', 'Finish the wildcard escape with *, ? or ~.'],
    ['abc~~~', 'Finish the wildcard escape with *, ? or ~.'],
  ]) {
    const rule = text(value!)
    expect(snapshotRule(rule)).toEqual(rule)
    expect(advancedFormattingDraftError(rule)).toBe(error)
    expect(conditionalFormatEditorDraftError({ scope: null, priority: null, rule })).toBe(error)
  }
  for (const value of ['abc~~', 'abc~*', 'abc~?', '🙂'.repeat(1024)])
    expect(advancedFormattingDraftError(text(value))).toBeNull()
  expect(advancedFormattingDraftError(text('abc~', 'contains'))).toBeNull()
})
