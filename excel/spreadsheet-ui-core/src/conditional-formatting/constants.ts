import type {
  SpreadsheetBorderSide,
} from '../backend'
import type { ConditionalFormatEditorState, ConditionalFormatRuleKind } from './types'

export const CONDITIONAL_FORMAT_RULES_MAX = 200
export const CONDITIONAL_FORMAT_MUTATION_LEDGER_MAX = 32

export const INITIAL_EDITOR_STATE: ConditionalFormatEditorState = Object.freeze({
  open: false,
  sessionId: 0,
  requestId: null,
  ruleId: null,
  draft: null,
  selectedKind: 'cell-value',
  pending: false,
  error: null,
})

export const RULE_KINDS = [
  'cell-value',
  'formula',
  'data-bar',
  'color-scale',
  'top-bottom',
] as const satisfies readonly ConditionalFormatRuleKind[]

export const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const satisfies readonly SpreadsheetBorderSide[]
export const BORDER_STYLES = ['none', 'thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const
export const ALIGNMENTS = ['default', 'left', 'center', 'right', 'fill', 'justify', 'distributed'] as const
export const VERTICAL_ALIGNMENTS = ['top', 'center', 'bottom', 'justify', 'distributed'] as const
export const OVERFLOWS = ['overflow', 'clip', 'ellipsis', 'wrap', 'shrink-to-fit'] as const
export const NEGATIVE_FORMATS = ['minus', 'red', 'parens', 'red-parens'] as const
