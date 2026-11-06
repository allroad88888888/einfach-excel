import type { ChartOption } from './core'

const PIXEL_RATIO = 2

/** 离屏实例按当前配置重画一张 2× PNG（白底），与屏幕上的图表同一份配置。 */
export async function renderChartPng(option: ChartOption, width: number,
  height: number): Promise<Blob> {
  const { init } = await import('./echarts-runtime')
  const host = document.createElement('div')
  const chart = init(host, undefined, { renderer: 'canvas', width, height })
  try {
    chart.setOption({ ...option, animation: false }, { notMerge: true })
    const url = chart.getDataURL({ type: 'png', pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff' })
    return await (await fetch(url)).blob()
  } finally {
    chart.dispose()
  }
}

export async function copyChartPng(png: Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
    throw new Error('Image clipboard is unavailable. Download the PNG instead.')
  // Safari 要求在用户手势内同步构造 ClipboardItem，内容可以是 Promise。
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export async function downloadChartPng(png: Promise<Blob>, name: string): Promise<void> {
  const url = URL.createObjectURL(await png)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'chart'}.png`
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
