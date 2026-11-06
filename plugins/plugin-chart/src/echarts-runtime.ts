import { init, use } from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

/** 只按需注册用到的图表与组件；本模块在第一张图表出现时才动态加载。 */
use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent,
  TitleComponent, TooltipComponent, CanvasRenderer])

export { init }
export type { EChartsType } from 'echarts/core'
