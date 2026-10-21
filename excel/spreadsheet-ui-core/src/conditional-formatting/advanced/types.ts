import type { ColorScaleRule, DataBarRule } from '../types'

/** Numeric drafts stay strings; finite-number and formula semantics belong to Rust. */
export type ConditionalFormatThreshold =
  | { type: 'min' | 'max' }
  | { type: 'number' | 'percent' | 'percentile' | 'formula'; value: string }

export interface IconSetRule {
  kind: 'icon-set'
  enabled?: boolean
  iconSet: 'three-arrows' | 'three-traffic-lights' | 'three-flags'
  lowerThreshold?: ConditionalFormatThreshold
  upperThreshold?: ConditionalFormatThreshold
  reverse?: boolean
  showValue?: boolean
}

export type AdvancedVisualRule = ColorScaleRule | DataBarRule | IconSetRule
