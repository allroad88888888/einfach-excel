import type { ChartPalette } from '../spec-analysis'
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

/**
 * 「更改颜色」的方案：彩色变体与单色深浅（office 跟随主题）。
 * XLSX 导出在 `excel/rust/xlsx` 有同一张表，改动需两边同步。
 */
export const CHART_PALETTE_COLORS: Record<Exclude<ChartPalette, 'office'>, readonly string[]> = {
  colorful: ['#5b9bd5', '#70ad47', '#ffc000', '#ed7d31', '#a5a5a5', '#4472c4', '#264478', '#636363'],
  warm: ['#c0504d', '#f79646', '#ffc000', '#9e480e', '#e46c0a', '#d99694', '#ffd966', '#843c0c'],
  cool: ['#4472c4', '#5b9bd5', '#4bacc6', '#70ad47', '#264478', '#8064a2', '#2e75b6', '#548235'],
  blue: ['#4472c4', '#264478', '#698ed0', '#335aa1', '#8faadc', '#203864', '#b4c7e7', '#2f5597'],
  orange: ['#ed7d31', '#9e480e', '#f1975a', '#c55a11', '#f4b183', '#843c0c', '#f8cbad', '#c65911'],
  green: ['#70ad47', '#43682b', '#8cc168', '#548235', '#a9d18e', '#385723', '#c5e0b4', '#507e32'],
  gray: ['#7f7f7f', '#404040', '#a5a5a5', '#595959', '#bfbfbf', '#262626', '#d9d9d9', '#737373'],
}

/** 把设置里选的配色方案套进主题；转换器与设置面板都只读 theme.palette。 */
export function withPalette(theme: ChartTheme, palette: ChartPalette): ChartTheme {
  return palette === 'office' ? theme : { ...theme, palette: CHART_PALETTE_COLORS[palette] }
}
