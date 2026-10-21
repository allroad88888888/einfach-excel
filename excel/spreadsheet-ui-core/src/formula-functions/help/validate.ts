import type { NativeFormulaHelp } from '../types'

const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'

/** v2 must be complete at the Rust boundary; there is no placeholder fallback. */
export function isNativeFormulaHelp(value: unknown, name: string): value is NativeFormulaHelp {
  if (
    !object(value) ||
    !text(value.summary) ||
    !text(value.summary_zh) ||
    !Array.isArray(value.args) ||
    !Array.isArray(value.examples) ||
    !value.examples.length ||
    !value.examples.every(
      (example) =>
        text(example) &&
        example.startsWith('=') &&
        (example.startsWith(`=${name}(`) ||
          example.includes(`,${name}(`) ||
          example.includes(`(${name}(`)),
    ) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every((entry) => object(entry) && text(entry.en) && text(entry.zh))
  )
    return false
  const args = value.args
  if (!args.every((arg) => object(arg) && text(arg.name) && arg.name !== 'args' &&
    text(arg.description) && text(arg.description_zh) &&
    typeof arg.optional === 'boolean' && typeof arg.repeats === 'boolean')) return false
  // WASM uses undefined for None (omitted by JSON); native serde_json uses null.
  if (value.repeat == null) return args.every((arg) => !arg.repeats)
  const repeat = value.repeat
  if (!object(repeat) || !Number.isInteger(repeat.start) || !Number.isInteger(repeat.length) ||
    (repeat.start as number) < 0 || (repeat.length as number) < 1 ||
    ![0, 1].includes(repeat.min_groups as number)) return false
  const start = repeat.start as number
  const length = repeat.length as number
  if (start + length > args.length) return false
  return args.every((arg, index) => arg.repeats === (index >= start && index < start + length)) &&
    args[start].optional === (repeat.min_groups === 0)
}
