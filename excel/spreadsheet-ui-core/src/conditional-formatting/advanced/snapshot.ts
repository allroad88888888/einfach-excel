import { isObjectRecord, isOneOf } from '../snapshot-format'
import type { AdvancedVisualRule, ConditionalFormatThreshold } from './types'

const FIELDS = ['minThreshold', 'midThreshold', 'maxThreshold', 'lowerThreshold', 'upperThreshold'] as const

function snapshotThreshold(value: unknown): ConditionalFormatThreshold | null {
  if (!isObjectRecord(value)) return null
  if (value.type === 'min' || value.type === 'max') return { type: value.type }
  return isOneOf(value.type, ['number', 'percent', 'percentile', 'formula'] as const)
    && typeof value.value === 'string' ? { type: value.type, value: value.value } : null
}

/** Decode only transport shape; workbook validity is checked by the native command. */
export function snapshotAdvancedVisualRule(
  value: Record<string, unknown>,
): AdvancedVisualRule | null {
  const thresholds: Partial<Record<(typeof FIELDS)[number], ConditionalFormatThreshold>> = {}
  for (const field of FIELDS) {
    if (value[field] === undefined) continue
    const threshold = snapshotThreshold(value[field])
    if (!threshold) return null
    thresholds[field] = threshold
  }
  const enabled = value.enabled === undefined ? {} : { enabled: value.enabled as boolean }
  if (value.kind === 'icon-set') {
    if (
      !isOneOf(value.iconSet, ['three-arrows', 'three-traffic-lights', 'three-flags'] as const) ||
      (value.reverse !== undefined && typeof value.reverse !== 'boolean') ||
      (value.showValue !== undefined && typeof value.showValue !== 'boolean')
    )
      return null
    return {
      ...enabled,
      kind: value.kind,
      iconSet: value.iconSet,
      ...(thresholds.lowerThreshold && { lowerThreshold: thresholds.lowerThreshold }),
      ...(thresholds.upperThreshold && { upperThreshold: thresholds.upperThreshold }),
      ...(value.reverse === undefined ? {} : { reverse: value.reverse as boolean }),
      ...(value.showValue === undefined ? {} : { showValue: value.showValue as boolean }),
    }
  }
  const ends = {
    ...(thresholds.minThreshold && { minThreshold: thresholds.minThreshold }),
    ...(thresholds.maxThreshold && { maxThreshold: thresholds.maxThreshold }),
  }
  if (value.kind === 'data-bar') {
    if (
      (value.minColor !== undefined && typeof value.minColor !== 'string') ||
      (value.maxColor !== undefined && typeof value.maxColor !== 'string')
    )
      return null
    return {
      ...enabled,
      ...ends,
      kind: value.kind,
      ...(value.minColor === undefined ? {} : { minColor: value.minColor as string }),
      ...(value.maxColor === undefined ? {} : { maxColor: value.maxColor as string }),
    }
  }
  if (
    value.kind !== 'color-scale' ||
    typeof value.minColor !== 'string' ||
    typeof value.maxColor !== 'string' ||
    (value.midColor !== undefined && typeof value.midColor !== 'string')
  )
    return null
  return {
    ...enabled,
    ...ends,
    kind: value.kind,
    minColor: value.minColor,
    maxColor: value.maxColor,
    ...(thresholds.midThreshold && { midThreshold: thresholds.midThreshold }),
    ...(value.midColor === undefined ? {} : { midColor: value.midColor as string }),
  }
}

/** A dialog draft must never share mutable nested thresholds with a returned projection. */
export function copyAdvancedVisualRule<T extends AdvancedVisualRule>(rule: T, freeze = false): T {
  const result: Record<string, unknown> = { ...rule }
  for (const field of FIELDS) {
    if (!(field in result) || result[field] === undefined) continue
    const copy = { ...result[field] as ConditionalFormatThreshold }
    result[field] = freeze ? Object.freeze(copy) : copy
  }
  return result as unknown as T
}
