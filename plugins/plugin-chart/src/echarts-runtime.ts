import { init, use } from 'echarts/core'
import { BarChart, BoxplotChart, CandlestickChart, CustomChart, FunnelChart, LineChart, PieChart,
  RadarChart, ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent, TitleComponent,
  TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

/**
 * 只按需注册用到的图表与组件；本模块在第一张图表出现时才动态加载。
 * 自定义系列画误差线；SVG 渲染器只给「下载 SVG」用，屏幕上仍是 Canvas。
 */
use([BarChart, CustomChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart,
  BoxplotChart, CandlestickChart, TreemapChart, SunburstChart, GridComponent, LegendComponent,
  RadarComponent, TitleComponent, TooltipComponent, CanvasRenderer, SVGRenderer])

export { init }
export type { EChartsType } from 'echarts/core'
