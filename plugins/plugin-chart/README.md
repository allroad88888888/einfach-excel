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
设置：类型、数据区域（同表 A1 区域，逗号分隔多区域）、系列方向、首行/首列名称、标题、图例位置、
数据标签、网格线、坐标轴标题、值轴最小/最大值、字号、逐系列（饼图按扇区）配色、空单元格、
是否绘制隐藏行列；不适用于当前类型的项自动隐藏。每项改动立即写回 Rust，一项一条撤销记录。
插入：选中区域（可 Ctrl 多选）后在「插入」分组选类型或 ★ 推荐；按 Excel 规则猜表头与系列方向，放在选区右侧。
对象：双击打开设置；拖动、缩放、Delete、右键菜单与 Ctrl/⌘+C/X/V、置于顶层/底层；设置栏可复制图片或下载 PNG。

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

暂不支持：跨表数据区域、XLSX 图表导入导出、趋势线与误差线、SVG 导出。
