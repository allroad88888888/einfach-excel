# 图片导出插件

工作区包 `@einfach-excel/plugin-image-export`，导出 `imageExportPlugin`，尚未发布。
宿主将它传给 `<Spreadsheet plugins={[imageExportPlugin]} />`。演示使用 `?plugins=image-export`。

通过「导出选区为图片」工具栏按钮或单元格右键菜单，读取当前连续选区并导出 PNG。
面板提供 1×/2× 比例、复制 PNG 和下载 PNG；读区域不改选区、不替换可见投影，也不产生撤销记录。

读取复用 UI Core 的 `readWorkbookDisplayRangeAtom`，渲染复用 React 包根入口
`renderSpreadsheetRangeAsPng(snapshot, { scale })` 与 Canvas 单元格绘制器。
DOM/Canvas 主界面均可导出，原生条件格式、合并、字体与边框沿同一绘制路径。
隐藏、筛选和折叠行列不占图片空间；相交的合并单元格必须完整选中。

上限：65,536 个单元格、16,777,216 像素，任一边不超过 16,384 像素。
超过限制会显示可重试错误。图片剪贴板需要浏览器支持及权限；不支持时仍可下载 PNG。
读取时的工作簿修订版就是输出快照，面板打开后不追踪后续内容变化。
