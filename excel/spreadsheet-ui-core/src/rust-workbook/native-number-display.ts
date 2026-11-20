import type { DisplayCell } from '../contracts'

/** Rust 自定义格式代码校验失败的类型化原因；文案由视图层按代码翻译。 */
export type NumberFormatCodeError =
  | 'empty'
  | 'too-long'
  | 'too-many-sections'
  | 'unclosed-quote'
  | 'unclosed-bracket'
  | 'unknown-bracket'
  | 'incomplete-escape'
  | 'multiple-decimal-points'
  | 'text-with-digits'

type CharMark = { readonly char: string; readonly at: number }

/** `format.preview` 的结果：与网格同源的文本、段颜色、填充与留白，或无效代码的错误码。 */
export type RustNumberFormatPreview =
  | {
    readonly text: string; readonly color?: string; readonly fill?: CharMark
    readonly pads?: readonly CharMark[]; readonly invalidCode?: undefined
  }
  | { readonly invalidCode: NumberFormatCodeError; readonly text?: undefined }

/** 单格快照里的 Rust 格式化显示：文本、段颜色、`*x` 填充与 `_x` 留白位置。 */
export interface RustNativeNumberDisplay {
  readonly formattedDisplay?: string
  readonly formattedColor?: string
  readonly formattedFill?: CharMark
  readonly formattedPads?: readonly CharMark[]
}

/** 显示格式快照里条件格式改了字体色的格（A1）；条件色压过段颜色。 */
export interface RustConditionalFontColors {
  readonly conditionalFontColors?: readonly string[]
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function validMark(mark: CharMark, length: number): boolean {
  return Array.from(mark.char).length === 1 && Number.isInteger(mark.at) &&
    mark.at >= 0 && mark.at <= length
}

/** 只做传输校验：颜色必须是 #rrggbb；填充/留白是一个字符且位置落在显示文本内。 */
export function nativeNumberDisplay(
  snapshot: RustNativeNumberDisplay,
): DisplayCell['numberFormatDisplay'] {
  const { formattedColor: color, formattedFill: fill, formattedPads: pads } = snapshot
  if (color === undefined && fill === undefined && !pads?.length) return undefined
  const length = Array.from(snapshot.formattedDisplay ?? '').length
  if (color !== undefined && !HEX_COLOR.test(color))
    throw new Error('Rust returned an invalid number-format color.')
  if ((fill !== undefined && !validMark(fill, length)) ||
    pads?.some((pad) => !validMark(pad, length - 1)))
    throw new Error('Rust returned an invalid number-format fill or padding.')
  return {
    ...(color === undefined ? {} : { color }),
    ...(fill === undefined ? {} : { fill: { char: fill.char, at: fill.at } }),
    ...(pads?.length ? { pads: pads.map(({ char, at }) => ({ char, at })) } : {}),
  }
}
