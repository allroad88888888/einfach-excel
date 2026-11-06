import type { ChartTheme } from './types'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 与 Office 默认配色顺序接近的 8 色；深色模式整体提亮，保证与深底的对比度。 */
export const LIGHT_CHART_THEME: ChartTheme = {
  palette: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e'],
  text: '#242538', muted: '#6b6a7d', axisLine: '#b9b8c7', gridline: '#e6e5ee',
  background: '#ffffff', fontFamily: FONT,
}

export const DARK_CHART_THEME: ChartTheme = {
  palette: ['#7aa2f7', '#f5a26b', '#c7c7cf', '#ffd166', '#82c4f0', '#94d57a', '#a9b8ff', '#e58c5a'],
  text: '#e6e5f0', muted: '#a19eb4', axisLine: '#4a4960', gridline: '#2e2d3d',
  background: '#1c1b27', fontFamily: FONT,
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK_CHART_THEME : LIGHT_CHART_THEME
}
