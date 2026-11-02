# @einfach-excel/xlsx

XLSX ⇄ einfach 原生工作簿文件（`.einfach.json`）转换器，Rust 源码在 `excel/rust/xlsx`，
编译成独立 WASM，宿主只在用户打开或导出 XLSX 时才加载，不增加工作簿主包体积。

```ts
import init, {
  xlsxToNative,
  nativeToXlsx,
  xlsxToNativeWithReport,
  nativeToXlsxWithReport,
} from '@einfach-excel/xlsx'

await init()
const native = xlsxToNative(new Uint8Array(await file.arrayBuffer()), 'Book') // 原生文件文本
const bytes = nativeToXlsx(native) // Uint8Array

// 如需同时拿到跳过/降级特性的结构化报告（ConversionReport JSON 字符串）：
const imported = xlsxToNativeWithReport(new Uint8Array(await file.arrayBuffer()), 'Book')
// imported.text: 原生 JSON 文本；imported.report: '{"items":[{"kind":"charts","count":1}],"summary":"Opened Excel workbook. Skipped: charts."}'
const exported = nativeToXlsxWithReport(native)
// exported.bytes: Uint8Array；exported.report: '{"items":[...],"summary":"..."}'
```

当前转换范围（读 XLSX → 原生 / 写原生 → XLSX 双向）：

- 工作表与表名、文本/数字/布尔/错误值、公式（含共享公式展开、动态数组锚点、`_xlfn.` 前缀）。
- 字体/填充/边框/对齐/换行/缩进、数字格式、合并、冻结窗格、列宽行高。
- 隐藏行、隐藏列（隐藏行列自身的尺寸不保留，可见行列的尺寸照常保留）。
- 超链接：仅 http(s) 外部链接；工作簿内跳转（`location`）、`mailto:` 等原生没有对应物，读取时跳过。
- 备注 ⇄ 旧式批注（`commentsN.xml`，导出时同时写 VML 绘图让 Excel 显示）。作者与富文本样式不保留；
  原生线程批注导出为 "作者: 正文" 多行备注（该格已有备注时以备注为准）；XLSX 线程批注读取时不转换。
- 工作簿级命名区域 ⇄ `definedNames`（单格、矩形、整行整列）。公式型、工作表级、内置（`_xlnm.*`）、
  隐藏名字读取时跳过；与函数名冲突的名字由引擎在打开时拒绝。
- 数据验证：列表（字面量，条目含逗号则无法导出）、整数/小数/日期/时间/文本长度（含比较运算符）、
  自定义公式，以及输入提示与出错提示。引用型列表/边界、`any` 类型跳过。
- 条件格式：单元格值比较、公式、文本包含/开头/结尾、重复/唯一、前后 N（含百分比）、色阶、数据条、
  以及带公式的空白/错误判断。图标集、高于平均、日期周期跳过；数据条负值色与 dxf 的边框/数字格式不转换。
- Excel Table：名称、范围、表头/汇总行、列名、四档样式（none/blue/green/gray ⇄ TableStyleMedium2/7/4）。
  筛选状态、计算列、汇总函数不转换。

- 1904 日期系统（`date1904`）：读入时把数字格式为日期（`kind == "date"`）的数值单元格与日期型数据验证边界自动加 `1462` 转为 1900 序列，并在报告中记录 `date1904` 提示；纯时间格式单元格保持不变。
- 结构化转换报告（`xlsxToNativeWithReport` / `nativeToXlsxWithReport`）：
  - 导入时检测并统计未转换内容：图片/绘图（`drawings`）、图表（`charts`）、数据透视表（`pivotTables`）、线程批注（`threadedComments`）、未支持的条件格式（`conditionalFormats`）、未支持的数据验证（`dataValidations`）、未支持的命名区域（`definedNames`）、非 http(s) 超链接（`hyperlinks`）、富文本局部样式（`richText`）、未支持的表特性（`tables`）、工作表保护（`sheetProtection`）、自动筛选（`autoFilter`）、大纲分组（`outline`）、打印设置（`printSetup`）、自定义主题字体（`themeFonts`）、外部链接（`externalLinks`）、VBA 宏（`macros`）。
  - 导出时检测并统计未写出或降级的原生内容：降级为备注的线程批注（`threadedCommentsAsNotes`）、未导出的条件格式/数据验证/名称/表（`conditionalFormats` / `dataValidations` / `definedNames` / `tables`）、整行整列默认样式（`rowColumnStyles`）、文字旋转（`cellRotation`）、工作表保护（`sheetProtection`）、自动筛选（`autoFilter`）、大纲分组（`outline`）、打印设置（`printSetup`）、自定义公式定义（`customFormulas`）、隐藏工作表与标签颜色（`sheetVisibilityOrColor`）。

尚未发布（`private: true`），发布时机见仓库进度说明。
