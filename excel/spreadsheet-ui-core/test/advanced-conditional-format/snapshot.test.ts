import { expect, test } from 'vitest'
import { snapshotRule } from '../../src/conditional-formatting/snapshot-rules'
import { copyRule, freezeRule } from '../../src/conditional-formatting/value-domain'

test('all advanced threshold shapes survive projection decoding without evaluating in TypeScript', () => {
  for (const threshold of [{ type: 'min' }, { type: 'max' },
    ...['number', 'percent', 'percentile', 'formula'].map(type => ({ type, value: '=A1' }))]) {
    const input = { kind: 'color-scale', minColor: '#000000', maxColor: '#ffffff', minThreshold: threshold }
    expect(snapshotRule(input)).toEqual(input)
  }
  const input = { kind: 'icon-set', iconSet: 'three-flags', reverse: true, showValue: false,
    lowerThreshold: { type: 'percentile', value: '25' }, upperThreshold: { type: 'formula', value: '=$Z$1' } }
  expect(snapshotRule(input)).toEqual(input)
})

test('malformed threshold transport and icon options cannot hydrate rules', () => {
  for (const patch of [
    { lowerThreshold: { type: 'number', value: 3 } }, { lowerThreshold: { type: 'unknown' } },
    { iconSet: 'four-arrows' }, { showValue: 'false' }, { reverse: 1 },
  ]) expect(snapshotRule({ kind: 'icon-set', iconSet: 'three-arrows', ...patch })).toBeNull()
})

test('copy and freeze isolate nested threshold drafts from the native projection', () => {
  const input = { kind: 'color-scale' as const, minColor: '#000000', maxColor: '#ffffff',
    minThreshold: { type: 'number' as const, value: '0' } }
  const copy = copyRule(input)
  if (copy.kind !== 'color-scale' || copy.minThreshold?.type !== 'number') throw new Error('Wrong rule')
  copy.minThreshold.value = '9'
  expect(input.minThreshold.value).toBe('0')
  const frozen = freezeRule(input)
  expect(Object.isFrozen(frozen)).toBe(true)
  expect(frozen.kind === 'color-scale' && Object.isFrozen(frozen.minThreshold)).toBe(true)
})

test('legacy visual rules retain omitted thresholds', () => {
  for (const rule of [{ kind: 'data-bar' }, { kind: 'color-scale', minColor: '#000000', maxColor: '#ffffff' }])
    expect(snapshotRule(rule)).toEqual(rule)
})
