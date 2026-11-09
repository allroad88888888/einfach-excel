export const SPARKLINE_KIND = 'sparkline'
export const SPARKLINE_TYPES = ['line', 'column', 'winLoss'] as const
export type SparklineType = (typeof SPARKLINE_TYPES)[number]

/** 一组迷你图共用的设置（同 Excel 的迷你图组），存在对象载荷里。颜色按 Excel 默认。 */
export interface SparklineSpec {
  readonly type: SparklineType
  readonly color: string
  readonly negativeColor: string
  readonly markerColor: string
  readonly highColor: string
  readonly lowColor: string
  readonly firstColor: string
  readonly lastColor: string
  /** 折线：每个点画标记。 */
  readonly markers: boolean
  readonly high: boolean
  readonly low: boolean
  readonly first: boolean
  readonly last: boolean
  /** 负值点用 negativeColor（柱形、盈亏；折线的负值标记）。 */
  readonly negative: boolean
  /** 零值横轴。 */
  readonly axis: boolean
}

export const DEFAULT_SPARKLINE_SPEC: SparklineSpec = {
  type: 'line', color: '#376092', negativeColor: '#D00000', markerColor: '#D00000',
  highColor: '#D00000', lowColor: '#D00000', firstColor: '#D00000', lastColor: '#D00000',
  markers: false, high: false, low: false, first: false, last: false, negative: false,
  axis: false,
}

const COLOR = /^#[0-9a-fA-F]{6}$/
const FLAGS = ['markers', 'high', 'low', 'first', 'last', 'negative', 'axis'] as const
const COLORS = ['color', 'negativeColor', 'markerColor', 'highColor', 'lowColor', 'firstColor',
  'lastColor'] as const

/** 载荷 → 设置；非法或缺省字段回落默认值，文件里的旧字段不会让迷你图消失。 */
export function parseSparklineSpec(payload: Readonly<Record<string, unknown>>): SparklineSpec {
  const spec: Record<string, unknown> = { ...DEFAULT_SPARKLINE_SPEC }
  if (SPARKLINE_TYPES.includes(payload.type as SparklineType)) spec.type = payload.type
  for (const key of COLORS)
    if (typeof payload[key] === 'string' && COLOR.test(payload[key] as string))
      spec[key] = (payload[key] as string).toUpperCase()
  for (const key of FLAGS) if (typeof payload[key] === 'boolean') spec[key] = payload[key]
  return spec as unknown as SparklineSpec
}
