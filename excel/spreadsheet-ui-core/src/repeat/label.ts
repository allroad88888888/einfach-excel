import type { SelectionMutation } from '../toolbar/selection-mutation-command'
import type { RepeatIntent, RepeatLabel } from './types'

const FORMAT_FIELD_LABELS: Readonly<Record<string, RepeatLabel>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  wrap: 'wrap-text',
  bgColor: 'fill-color',
  fgColor: 'text-color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  align: 'alignment',
  verticalAlign: 'alignment',
  rotation: 'alignment',
  indent: 'indent',
  numberFormat: 'number-format',
}

function mutationLabel(mutation: SelectionMutation): RepeatLabel {
  if (mutation.kind === 'clear') return `clear-${mutation.mode}`
  if (mutation.borderPatch || mutation.format.borders) return 'borders'
  const fields = [...Object.keys(mutation.format), ...(mutation.clearFormatFields ?? [])]
  const labels = new Set(fields.map((field) => FORMAT_FIELD_LABELS[field] ?? 'format'))
  return labels.size === 1 ? [...labels][0]! : 'format'
}

/** 由意图推导提示名称，单一来源避免每个命令各写一份。 */
export function repeatLabelFor(intent: RepeatIntent): RepeatLabel {
  switch (intent.kind) {
    case 'mutation': return mutationLabel(intent.mutation)
    case 'size': return intent.axis === 'row' ? 'row-height' : 'column-width'
    default: return intent.action
  }
}
