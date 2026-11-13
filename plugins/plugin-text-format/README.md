# 文字格式插件

`textFormatPlugin` 提供整格上标、下标编辑，安装后进入现有字体组。当前为工作区插件，尚未发布。

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import { textFormatPlugin } from '@einfach-excel/plugin-text-format'

<Spreadsheet definition={definition} plugins={[textFormatPlugin]} />
```

演示站使用 `?plugins=text-format`。默认不安装任何插件；已有上下标格式仍由核心正确显示、保存和导出。

插件自己的 `/core` 入口导出 `runFontBaselineAtom` 与 `fontBaselineFeedbackAtom`。
每个 Store 独立保存执行反馈，切换工作簿连接后旧反馈失效。按钮调用核心公开的
`applySelectionFormatAtom`，由 Rust 执行一次格式事务；插件不直接请求 Worker、不保存工作簿副本。

组内贡献 ID 为 `plugin:text-format:font-baseline`，锚点为 `format.decrease-font-size`。
宿主可经 `ui.ribbon.hidden` 隐藏整项贡献，也可分别使用 `format.superscript`、`format.subscript`
隐藏按钮。隐藏锚点不隐藏插件贡献。中英文文案和仅在插件挂载时生效的紧凑布局由插件提供。

整格格式、富文本分段继承、历史、重复、AutoFit、DOM/Canvas 渲染及原生/XLSX 语义归核心所有。
局部富文本上下标编辑仍待接入本业务域。
