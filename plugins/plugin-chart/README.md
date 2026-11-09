# 图表插件

工作区包 `@einfach-excel/plugin-chart`，导出 `chartPlugin`，尚未发布。
宿主将它传给 `<Spreadsheet plugins={[chartPlugin]} />`。演示使用 `?plugins=chart`。

## 分工

| 层 | 负责 |
|---|---|
| Rust（核心，通用） | 浮动对象目录：锚点、数据引用随插删行列移动、撤销重做、`.einfach.json` 保存；不认识图表 |
| UI Core（核心，通用） | 对象目录缓存、增删改命令、拖动缩放预览与锚点换算 |
| react-excel（核心，通用） | 浮动对象层：框、选中、拖动缩放、Delete 删除、冻结与滚动下定位 |
| 本插件 Core | 图表设置（对象载荷）、读数据、整形、转换成 ECharts 配置、插入与设置命令 |
| 本插件 React | ECharts 挂载、「插入」分组、设置侧栏 |

ECharts 只在本包依赖，按需注册柱、线、饼、散点及标题、图例、提示框、网格组件，
第一张图表出现时才动态加载。

## 数据链路

```
单元格修改 → Rust 重算 → 投影修订推进
  → loadChartGridAtom 读一次图表区域（显示文本 + 数值，≤ 10,000 格）
  → layoutChartData 整形（系列、类别、名称）
  → toEChartsOption：按类型生成基础配置，再经主题、标题、图例、提示框、数据标签、网格依次加工
  → ChartView setOption
```

数据标签和提示框使用单元格显示文本，保持单元格数字格式；百分比堆积只在绘制时归一化。

## 范围

类型：柱形、条形、折线、面积、组合（逐系列柱/线、次坐标轴）、饼、圆环、散点；堆积与百分比堆积。
「更多图表」菜单：雷达、漏斗、瀑布（增量从累计值起画，Total/合计 等类别画汇总柱）、
直方图（Scott 规则分箱）、箱线图（排除中位数四分位）、股价图（恰好四个数值系列：开盘/最高/最低/收盘）、
树状图与旭日图（前几列是层级、最后一列是数值）。数据不满足类型约定时显示错误，不硬画。
设置：类型、数据区域（A1 区域，逗号分隔多区域；其他表写 `Data!A1:B5` 或 `'My data'!A1:B5`）、系列方向、首行/首列名称、标题、图例位置、
数据标签、网格线、坐标轴标题、值轴最小/最大值、字号、逐系列（饼图按扇区）配色、空单元格、
是否绘制隐藏行列；不适用于当前类型的项自动隐藏。每项改动立即写回 Rust，一项一条撤销记录。
设计：快速布局（6 种标题 / 图例 / 数据标签 / 坐标轴标题组合，套用后可逐项再改）、更改颜色（彩色与单色方案）。
分析（不堆积的柱、条、线、面积、散点、组合图）：逐系列趋势线（线性、指数、对数、多项式 2–6 阶、乘幂、
移动平均，可显示公式与 R²，插件自己做最小二乘回归，类别图的 x 取 1、2、3…）；整图误差线（固定值、百分比、
标准偏差（画在系列平均值处）、标准误差，正负 / 正 / 负）。
插入：选中区域（可 Ctrl 多选）后在「插入」分组选类型或 ★ 推荐；按 Excel 规则猜表头与系列方向，放在选区右侧。
数据源：区域栏也可填表格或已定义名称（`Sales`、`Data!Sales`、`Table1`、`Table1[Revenue]`、
`Table1[[Month]:[West]]`），每次读数据按当前目录解析，表格扩行、名称改指向后图表跟着变；
从正好是一个表格的选区插入时自动引用表名（同 Excel）。宿主 API 在 `spec.source` 里给名称即可。
联动：选中图表时按 Excel 的配色标出数据源（系列名红、类别紫、数值蓝，走宿主高亮层，宿主自己的
高亮保留）；点击柱子、扇区、散点等数据点再标出它的单元格，点空白处取消。
对象：双击打开设置；拖动、缩放、Delete、右键菜单与 Ctrl/⌘+C/X/V、置于顶层/底层；设置栏可复制图片、下载 PNG 或 SVG（浏览器内离屏重画，不走网络）。

## 载荷字段

图表存在浮动对象目录里（`kind: "chart"`），设置就是对象的 `payload`。XLSX 转换器
（`excel/rust/xlsx/src/chart_payload.rs`）按同一份字段读写；增减字段两边要同步。
读到缺失或非法的字段时回落默认值（`parseChartSpec`），所以转换器只写它认识的字段。

| 字段 | 取值 | 默认 |
| --- | --- | --- |
| `type` | column、bar、line、area、combo、pie、doughnut、scatter、radar、funnel、waterfall、histogram、boxplot、stock、treemap、sunburst | column |
| `title` / `xTitle` / `yTitle` | 文本，≤255 字符 | 空 |
| `seriesIn` | columns（每列一个系列）、rows | columns |
| `headerRow` / `headerCol` | 拼好的数据表首行是系列名 / 首列是类别 | true / true |
| `legend` | right、bottom、top、left、none | right |
| `stack` | none、stacked、percent | none |
| `dataLabels` / `gridlines` / `showHidden` | 布尔 | false / true / false |
| `yMin` / `yMax` | 数字或 null | null |
| `fontSize` | 8–24 或 null | null（12） |
| `colors` | 按系列（饼图、圆环按类别）的 `#RRGGBB` 或 null | 空 |
| `combo` | 逐系列 `{ kind?: column \| line, secondary?: boolean }` | 空（最后一个系列是线、在次坐标轴） |
| `emptyCells` | gap、zero、connect | gap |
| `trendlines` | 按系列 `{ kind: linear \| exponential \| logarithmic \| polynomial \| power \| movingAverage, order: 2–6, period: 2–255, showEquation, showR2 }` 或 null | 空 |
| `errorBars` | `{ kind: fixed \| percent \| stdDev \| stdErr, amount ≥ 0, direction: both \| plus \| minus }` 或 null | null |
| `palette` | office、colorful、warm、cool、blue、orange、green、gray（色表与 `src/core/convert/theme.ts` 一致） | office |
| `source` | 表格或已定义名称；空串表示用对象的 `refs`（引用名称时 `refs` 是上次解析的缓存，XLSX 导出按当前名称重新解析） | 空 |

数据区域在对象的 `refs` 里：多块区域先拼成一张表（同高左右拼、同宽上下拼），再按 `seriesIn`、
`headerRow`、`headerCol` 切出类别与系列。

## 宿主 API

```ts
import { createWorkbookApi } from '@einfach-excel/spreadsheet-ui-core'
import { createChartApi } from '@einfach-excel/plugin-chart/core'

const charts = createChartApi(createWorkbookApi(store))
const added = await charts.insert({ sheetId: 'sales', data: 'A1:C13', type: 'line',
  spec: { title: '月度销售' } })
await charts.update('sales', 'chart-1', { spec: { legend: 'bottom' }, anchor: { width: 640 } })
const stop = charts.onChange((event) => console.log(event.type, event.sheetId, event.id))
```

| 方法 | 说明 |
| --- | --- |
| `list(sheetId?)` / `get(sheetId, id)` | 图表 id、所在表、数据区域文本、锚点与设置；不给表时列整本 |
| `insert({ sheetId, data, type?, id?, spec?, anchor? })` | 读一次数据猜表头与系列方向；`type` 缺省按推荐；位置缺省在数据右侧 |
| `update(sheetId, id, { spec?, data?, anchor? })` | 只改给出的部分 |
| `remove(sheetId, id)` / `order(sheetId, id, toFront)` | 只作用于图表，不动其他插件的对象 |
| `onChange(listener)` | 逐张图表的 insert / update / remove，含撤销重做、插删行列带来的移动；返回取消函数 |

写入走工作簿宿主操作（明确目标表、`beforeChange` 拦截、共享撤销、`onChange` 事件），可写非当前表；
返回 `{ status: 'ok', … }` 或 `{ status: 'error', error: { code, message } }`。门面本身不保存图表状态；
`onChange` 在有订阅时按工作簿变化重读受影响的表并比较。

跨表数据：引用按工作表的稳定身份保存，改名、移动不影响；那张表插删行列时引用随之移动（撤销一并还原）；
删表后图表显示 #REF!，撤销删表即恢复。文件里按表名保存。把图表粘贴到别的表时，原来的同表引用改指来源表。

XLSX：趋势线写成 `c:trendline`、误差线写成每个系列的 `c:errBars`；非默认配色方案导出为显式颜色，
读回来是逐系列颜色（`palette` 回到 office）。移动平均没有公式与 R²，这两个开关不往返。
