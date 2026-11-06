import type { ConvertInput } from './types'

/** 第 index 个颜色槽：用户在设置里指定的优先，其次调用方给的默认，最后主题配色循环取。 */
export function slotColor({ spec, theme }: ConvertInput, index: number, fallback?: string): string {
  return spec.colors[index] ?? fallback ?? theme.palette[index % theme.palette.length]!
}
