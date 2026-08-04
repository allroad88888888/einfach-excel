import type {
  TextToColumnsColumnFormat,
  TextToColumnsDelimitedConfig,
  TextToColumnsDelimiter,
  TextToColumnsFixedConfig,
  TextToColumnsMode,
  TextToColumnsNextBlockReason,
  TextToColumnsWizardState,
} from './types'

class ImmutableReadonlySet<Value> {
  private readonly items: readonly Value[]

  constructor(values: Iterable<Value>) {
    this.items = Object.freeze(Array.from(new Set(values)))
    Object.freeze(this)
  }

  get size(): number {
    return this.items.length
  }

  has(value: Value): boolean {
    return this.items.includes(value)
  }

  forEach(callback: (value: Value, valueAgain: Value, set: ReadonlySet<Value>) => void, thisArg?: unknown): void {
    for (const value of this.items) callback.call(thisArg, value, value, this as unknown as ReadonlySet<Value>)
  }

  entries(): IterableIterator<[Value, Value]> {
    return this.items.map((value): [Value, Value] => [value, value]).values()
  }

  keys(): IterableIterator<Value> {
    return this.items.values()
  }

  values(): IterableIterator<Value> {
    return this.items.values()
  }

  [Symbol.iterator](): IterableIterator<Value> {
    return this.items.values()
  }
}

Object.freeze(ImmutableReadonlySet.prototype)

export function immutableReadonlySet<Value>(values: Iterable<Value>): ReadonlySet<Value> {
  return new ImmutableReadonlySet(values) as unknown as ReadonlySet<Value>
}

function snapshotDelimitedConfig(config: TextToColumnsDelimitedConfig): TextToColumnsDelimitedConfig {
  return Object.freeze({
    delimiters: immutableReadonlySet(config.delimiters),
    otherChar: config.otherChar,
    treatConsecutiveAsOne: config.treatConsecutiveAsOne,
    textQualifier: config.textQualifier,
  })
}

function snapshotFixedConfig(config: TextToColumnsFixedConfig): TextToColumnsFixedConfig {
  return Object.freeze({ breakpoints: Object.freeze(Array.from(config.breakpoints)) })
}

export function snapshotWizardState(state: TextToColumnsWizardState): TextToColumnsWizardState {
  switch (state.step) {
    case 'step-1':
      return Object.freeze({ step: 'step-1', mode: state.mode })
    case 'step-2-delimited':
      return Object.freeze({ step: 'step-2-delimited', mode: 'delimited', delimited: snapshotDelimitedConfig(state.delimited) })
    case 'step-2-fixed':
      return Object.freeze({ step: 'step-2-fixed', mode: 'fixed', fixed: snapshotFixedConfig(state.fixed) })
    case 'step-3':
      return Object.freeze({
        step: 'step-3', mode: state.mode, delimited: snapshotDelimitedConfig(state.delimited),
        fixed: snapshotFixedConfig(state.fixed), formats: Object.freeze(Array.from(state.formats)),
      })
  }
}

export const DEFAULT_DELIMITED_CONFIG: TextToColumnsDelimitedConfig = Object.freeze({
  delimiters: immutableReadonlySet<TextToColumnsDelimiter>(['tab']),
  otherChar: '',
  treatConsecutiveAsOne: false,
  textQualifier: '"',
})

export const DEFAULT_FIXED_CONFIG: TextToColumnsFixedConfig = Object.freeze({
  breakpoints: Object.freeze([] as number[]),
})

export const INITIAL_WIZARD_STATE: TextToColumnsWizardState = Object.freeze({
  step: 'step-1',
  mode: 'delimited',
})

export function nextBlockReason(state: TextToColumnsWizardState): TextToColumnsNextBlockReason {
  if (state.step === 'step-3') return 'already-final'
  if (state.step === 'step-2-delimited') {
    const hasOther = state.delimited.delimiters.has('other') && state.delimited.otherChar.length > 0
    const hasNonOther = Array.from(state.delimited.delimiters).some((delimiter) => delimiter !== 'other')
    return hasOther || hasNonOther ? null : 'delimiter-required'
  }
  if (state.step === 'step-2-fixed') return state.fixed.breakpoints.length > 0 ? null : 'breakpoint-required'
  return null
}

export function makeStepTwoState(mode: TextToColumnsMode, delimited = DEFAULT_DELIMITED_CONFIG, fixed = DEFAULT_FIXED_CONFIG): TextToColumnsWizardState {
  return mode === 'delimited'
    ? snapshotWizardState({ step: 'step-2-delimited', mode, delimited })
    : snapshotWizardState({ step: 'step-2-fixed', mode, fixed })
}

export function makeStepThreeState(
  mode: TextToColumnsMode,
  columnCount: number,
  delimited: TextToColumnsDelimitedConfig,
  fixed: TextToColumnsFixedConfig,
  previousFormats?: readonly TextToColumnsColumnFormat[],
): TextToColumnsWizardState {
  const formats: TextToColumnsColumnFormat[] = []
  for (let index = 0; index < columnCount; index += 1) formats.push(previousFormats?.[index] ?? 'general')
  return snapshotWizardState({ step: 'step-3', mode, delimited, fixed, formats })
}
