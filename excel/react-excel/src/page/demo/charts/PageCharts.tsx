import { WorkbookRuntimeProvider } from '../../WorkbookRuntimeProvider'
import { WorkbookView } from '../../../workbook/shell/WorkbookView'
import { CHARTS_WORKBOOK } from './charts-workbook'
import { demoPresentation } from '../demo-presentation'

/** 图表演示：预置五张图表，图表插件固定挂载，不依赖 `?plugins=chart`。 */
export function PageCharts() {
  return <WorkbookRuntimeProvider definition={CHARTS_WORKBOOK}
    {...demoPresentation({ chart: true })}>
    <WorkbookView />
  </WorkbookRuntimeProvider>
}
