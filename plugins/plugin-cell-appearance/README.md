# 单元格外观插件

`cellAppearancePlugin` 向共享边框面板贡献下斜线、上斜线、双斜线、清除斜线四个预设。
当前为工作区插件，尚未发布。

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import { cellAppearancePlugin } from '@einfach-excel/plugin-cell-appearance'

<Spreadsheet definition={definition} plugins={[cellAppearancePlugin]} />
```

演示站使用 `?plugins=cell-appearance`。Summary `F15:F17` 是原生斜线样例；
不安装插件时仍显示、复制和保存已有斜线，只隐藏这些编辑预设。

插件拥有 `borderPresets` 声明与中英文文案。共享面板的 `borderPanelAtom` 保存唯一草稿，
`runBorderPanelAtom` 复用原有选择格式命令，Rust 校验并提交一次历史。
当前没有独立可变状态，因此不另建插件 atom、控制器或工作簿副本。
卸载插件时，打开的草稿保留原预设并显示“已保存的位置”；仍可应用、取消，重装恢复插件标签。
多个工作簿的草稿、历史与本地翻译实例各自独立；重复或未知预设在挂载时拒绝。

斜线预设只替换两个对角方向，保留四条物理边。物理边框预设保留斜线；
“无边框”与快捷默认全边框的关闭操作清除全部六条边。快捷按钮遇到自定义物理边框时，
先切换到原有灰色细线预设，再次点击才关闭。支持细、中、粗、虚线、点线、双线及十六进制颜色。
边框编辑沿用单一连续范围、最多 100,000 格的限制；合并格只在锚点保存斜线。

核心拥有格式事实、保护、撤销、重复、复制填充及 DOM/Canvas/PNG 绘制。
斜线按完整逻辑格尺寸连角，冻结片段和视口只裁剪；双线沿实际斜线法向平移。
不改变文字、原字号、行高或列宽。

原生文件保存两个方向。XLSX 使用 `diagonalUp`、`diagonalDown` 与单个 `diagonal` 样式，
所以同时启用的两条斜线必须具有相同线型与颜色；不合法原生输入整次拒绝。
XLSX 未支持的斜线线型计入损失报告；整行、整列样式的 XLSX 转换沿用现有损失报告范围，
不承诺轴级斜线保真，也不声称与 Excel 的逐像素外观一致。
