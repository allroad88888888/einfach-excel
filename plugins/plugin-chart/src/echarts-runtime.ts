import { init, use } from 'echarts/core'
import { BarChart, BoxplotChart, CandlestickChart, FunnelChart, LineChart, PieChart, RadarChart,
  ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent, TitleComponent,
  TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

/** 只按需注册用到的图表与组件；本模块在第一张图表出现时才动态加载。 */
use([BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, BoxplotChart,
  CandlestickChart, TreemapChart, SunburstChart, GridComponent, LegendComponent, RadarComponent,
  TitleComponent, TooltipComponent, CanvasRenderer])

export { init }
export type { EChartsType } from 'echarts/core'
