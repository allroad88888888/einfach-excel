import type {
  TextToColumnsDelimitedConfig,
  TextToColumnsDelimiter,
  TextToColumnsFixedConfig,
  TextToColumnsMode,
  TextToColumnsPreviewRow,
  TextToColumnsWizardState,
} from './types'

export interface TextToColumnsEffectiveConfig {
  readonly mode: TextToColumnsMode
  readonly delimited: TextToColumnsDelimitedConfig
  readonly fixed: TextToColumnsFixedConfig
}

export function effectiveTextToColumnsConfig(
  state: TextToColumnsWizardState,
  defaults: Pick<TextToColumnsEffectiveConfig, 'delimited' | 'fixed'>,
): TextToColumnsEffectiveConfig {
  switch (state.step) {
    case 'step-1':
      return { mode: state.mode, ...defaults }
    case 'step-2-delimited':
      return { mode: 'delimited', delimited: state.delimited, fixed: defaults.fixed }
    case 'step-2-fixed':
      return { mode: 'fixed', delimited: defaults.delimited, fixed: state.fixed }
    case 'step-3':
      return { mode: state.mode, delimited: state.delimited, fixed: state.fixed }
  }
}

function delimiterChar(delimiter: TextToColumnsDelimiter, otherChar: string): string {
  switch (delimiter) {
    case 'tab':
      return '\t'
    case 'semicolon':
      return ';'
    case 'comma':
      return ','
    case 'space':
      return ' '
    case 'other':
      return otherChar.length > 0 ? otherChar.charAt(0) : ''
  }
}

export function tokenize(text: string, config: TextToColumnsEffectiveConfig): string[] {
  if (config.mode === 'fixed') return tokenizeFixed(text, config.fixed.breakpoints)
  return tokenizeDelimited(text, config.delimited)
}

function tokenizeFixed(text: string, breakpoints: readonly number[]): string[] {
  if (breakpoints.length === 0) return [text]
  const sorted = [...breakpoints].sort((a, b) => a - b).filter((breakpoint) => breakpoint > 0)
  const cuts = [0, ...sorted]
  const tokens: string[] = []
  for (let index = 0; index < cuts.length; index += 1) {
    const start = cuts[index]
    const end = index + 1 < cuts.length ? cuts[index + 1] : text.length
    tokens.push(start >= text.length ? '' : text.slice(start, Math.min(end, text.length)))
  }
  return tokens
}

function tokenizeDelimited(text: string, config: TextToColumnsDelimitedConfig): string[] {
  const chars = new Set<string>()
  for (const delimiter of config.delimiters) {
    const character = delimiterChar(delimiter, config.otherChar)
    if (character.length > 0) chars.add(character)
  }
  if (chars.size === 0) return [text]

  const qualifier = config.textQualifier === 'none' ? '' : config.textQualifier
  const tokens: string[] = []
  let current = ''
  let inQualifier = false
  let fieldStart = true
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (qualifier && character === qualifier) {
      if (inQualifier && text[index + 1] === qualifier) {
        current += qualifier
        index += 2
        continue
      }
      if (inQualifier) {
        inQualifier = false
        fieldStart = false
        index += 1
        continue
      }
      if (fieldStart) {
        inQualifier = true
        fieldStart = false
        index += 1
        continue
      }
    }
    if (!inQualifier && chars.has(character)) {
      tokens.push(current)
      current = ''
      index += 1
      if (config.treatConsecutiveAsOne) {
        while (index < text.length && chars.has(text[index])) index += 1
      }
      fieldStart = true
      continue
    }
    current += character
    fieldStart = false
    index += 1
  }
  tokens.push(current)
  return tokens
}

export function previewColumnCount(rows: readonly TextToColumnsPreviewRow[]): number {
  let max = 1
  for (const row of rows) max = Math.max(max, row.tokens.length)
  return max
}
