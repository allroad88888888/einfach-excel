# 文字格式插件

`textFormatPlugin` 提供整格上标、下标编辑及富文本选区的局部上下标。当前为工作区插件，尚未发布。

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
局部按钮通过 `richTextTools` 加入共享富文本对话框；`richTextBaselineAtom` 从相交文本段派生
选区摘要，`runRichTextBaselineAtom` 修改原有草稿。混合选区应用目标效果；再次点击相同效果写入
显式正常基线，覆盖整格上下标。原有“重置所选格式”清除覆盖，恢复整格继承。
空选区与保存期间禁用工具；仅保存产生一次原生历史，取消丢弃草稿，卸载插件保留草稿。
HTML 复制保留安全的分段字形样式，纯文本仍是原文字，不替换成 Unicode 上下标字符。
普通复制、剪切与填充保留分段；仅粘贴值移除目标文本段覆盖，即使文字相同也可单步撤销恢复。
Table 内富文本编辑仍未开放。
