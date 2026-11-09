import type { ChartOption } from './core'
import type { EChartsType } from './echarts-runtime'

const PIXEL_RATIO = 2
const BACKGROUND = '#ffffff'

/** 在浏览器里建一个不挂到页面的离屏实例，按与屏幕相同的配置重画一次，用完即释放。 */
async function withOffscreenChart<T>(renderer: 'canvas' | 'svg', option: ChartOption,
  width: number, height: number, read: (chart: EChartsType) => T): Promise<T> {
  const { init } = await import('./echarts-runtime')
  const chart = init(document.createElement('div'), undefined, { renderer, width, height })
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: BACKGROUND },
      { notMerge: true })
    return read(chart)
  } finally {
    chart.dispose()
  }
}

/** 2× PNG（白底）。 */
export async function renderChartPng(option: ChartOption, width: number,
  height: number): Promise<Blob> {
  const url = await withOffscreenChart('canvas', option, width, height,
    (chart) => chart.getDataURL({ type: 'png', pixelRatio: PIXEL_RATIO }))
  return (await fetch(url)).blob()
}

/** 矢量 SVG（白底），文字保持为文本。 */
export async function renderChartSvg(option: ChartOption, width: number,
  height: number): Promise<Blob> {
  const svg = await withOffscreenChart('svg', option, width, height,
    (chart) => chart.renderToSVGString())
  return new Blob([svg], { type: 'image/svg+xml' })
}

export async function copyChartPng(png: Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
    throw new Error('Image clipboard is unavailable. Download the PNG instead.')
  // Safari 要求在用户手势内同步构造 ClipboardItem，内容可以是 Promise。
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export async function downloadChartImage(image: Promise<Blob>, name: string,
  extension: 'png' | 'svg'): Promise<void> {
  const url = URL.createObjectURL(await image)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'chart'}.${extension}`
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
