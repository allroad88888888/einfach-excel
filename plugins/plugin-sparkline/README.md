# @einfach-excel/plugin-sparkline

单元格内迷你图（折线、柱形、盈亏），对应 Excel 的迷你图组。

```tsx
import { sparklinePlugin } from '@einfach-excel/plugin-sparkline'
<Spreadsheet plugins={[sparklinePlugin]} />
```

- 「插入」组按类型打开「创建迷你图」：数据区域预填选区，位置是一行或一列；位置一列时数据按行切，一行时按列切。
- 一组存成一个格内对象（`placement: 'cell'`）：`refs = [位置, 数据]`，设置在载荷里，插删行列随引用移动。
- 活动单元格在组内时同组出现设计选项：类型、颜色、标记颜色、高/低/首/尾/负点、标记、坐标轴、清除整组。
- 每条迷你图各自定纵轴；空格与文字跳过，折线在空位断开。
