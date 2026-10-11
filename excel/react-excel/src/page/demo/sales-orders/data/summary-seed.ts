import type { RustImportCell } from '@einfach/spreadsheet-ui-core'

/** 第二张表展示跨表引用：改名后数值应保持，修改订单后仍应重算。 */
export const SALES_ORDER_SUMMARY_CELLS: readonly RustImportCell[] = [
  // D62/E62：手动重算可见的随机数及下游；只导入原生公式，不在 React 模拟。
  { sheet: 1, row: 60, col: 3, kind: 'text', value: 'Recalculate: RAND', format: { bold: true } },
  { sheet: 1, row: 60, col: 4, kind: 'text', value: 'RAND × 2', format: { bold: true } },
  { sheet: 1, row: 61, col: 3, kind: 'formula', value: '=RAND()' },
  { sheet: 1, row: 61, col: 4, kind: 'formula', value: '=D62*2' },
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'First order total', format: { bold: true } },
  { sheet: 1, row: 0, col: 1, kind: 'formula', value: "='Sales Orders'!G2" },
  { sheet: 1, row: 1, col: 0, kind: 'text', value: 'Customer' },
  { sheet: 1, row: 1, col: 1, kind: 'formula', value: "='Sales Orders'!B2" },
  { sheet: 1, row: 9, col: 0, kind: 'text', value: 'Hidden row example' },
  { sheet: 1, row: 0, col: 6, kind: 'text', value: 'Hidden column example' },
  // 日期原始序号：日填充、月末填充及 1900 兼容闰日；不在视图伪造日期。
  { sheet: 1, row: 19, col: 0, kind: 'number', value: 45350,
    format: { bold: true, numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } },
  { sheet: 1, row: 19, col: 2, kind: 'number', value: 45322,
    format: { italic: true, numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } },
  { sheet: 1, row: 20, col: 2, kind: 'number', value: 45351,
    format: { italic: true, numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } },
  { sheet: 1, row: 19, col: 4, kind: 'number', value: 60,
    format: { underline: true, numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } },
  // 序列样本：A40:A41 等差、C40:C41 编号、E40:E43 非等差趋势。
  { sheet: 1, row: 38, col: 0, kind: 'text', value: 'Series examples', format: { bold: true } },
  { sheet: 1, row: 39, col: 0, kind: 'number', value: 1 },
  { sheet: 1, row: 40, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 39, col: 2, kind: 'text', value: 'Item001', format: { italic: true } },
  { sheet: 1, row: 40, col: 2, kind: 'text', value: 'Item003', format: { italic: true } },
  // 名称序列：星期跨周、月份跨年、自定义优先级，真实文本及样式仍由 Rust 导入。
  { sheet: 1, row: 54, col: 0, kind: 'text', value: 'Friday', format: { bold: true } },
  { sheet: 1, row: 54, col: 2, kind: 'text', value: 'Nov', format: { italic: true } },
  { sheet: 1, row: 54, col: 4, kind: 'text', value: 'Low', format: { underline: true } },
  // A25:C29：按组升序、分数降序；样式跟随单元格，整条记录一起移动。
  { sheet: 1, row: 24, col: 0, kind: 'text', value: 'Team', format: { bold: true } },
  { sheet: 1, row: 24, col: 1, kind: 'text', value: 'Score', format: { bold: true } },
  { sheet: 1, row: 24, col: 2, kind: 'text', value: 'Record', format: { bold: true } },
  { sheet: 1, row: 25, col: 0, kind: 'text', value: 'West' },
  { sheet: 1, row: 25, col: 1, kind: 'number', value: 20 },
  { sheet: 1, row: 25, col: 2, kind: 'text', value: 'W20', format: { bold: true } },
  { sheet: 1, row: 26, col: 0, kind: 'text', value: 'East' },
  { sheet: 1, row: 26, col: 1, kind: 'number', value: 10 },
  { sheet: 1, row: 26, col: 2, kind: 'text', value: 'E10', format: { italic: true } },
  { sheet: 1, row: 27, col: 0, kind: 'text', value: 'West' },
  { sheet: 1, row: 27, col: 1, kind: 'number', value: 10 },
  { sheet: 1, row: 27, col: 2, kind: 'text', value: 'W10' },
  { sheet: 1, row: 28, col: 0, kind: 'text', value: 'East' },
  { sheet: 1, row: 28, col: 1, kind: 'number', value: 30 },
  { sheet: 1, row: 28, col: 2, kind: 'text', value: 'E30', format: { underline: true } },
  { sheet: 1, row: 59, col: 0, kind: 'text', value: '星期五' },
  { sheet: 1, row: 59, col: 2, kind: 'text', value: '11月' },
  { sheet: 1, row: 39, col: 4, kind: 'number', value: 0 },
  { sheet: 1, row: 40, col: 4, kind: 'number', value: 2 },
  { sheet: 1, row: 41, col: 4, kind: 'number', value: 1 },
  { sheet: 1, row: 42, col: 4, kind: 'number', value: 5 },
  // 定向填充示例：B71:B73 向下填公式；D71:F71 向右填文字及下划线。
  // 快捷公式：C65:E67 为三组数值，68 行留空供按钮生成草稿；70 行保留原生计算样例。
  { sheet: 1, row: 63, col: 2, kind: 'text', value: 'SUM', format: { bold: true } },
  { sheet: 1, row: 63, col: 3, kind: 'text', value: 'AVERAGE', format: { bold: true } },
  { sheet: 1, row: 63, col: 4, kind: 'text', value: 'COUNT', format: { bold: true } },
  ...[2, 3, 4].flatMap((col): RustImportCell[] => [
    { sheet: 1, row: 64, col, kind: 'number', value: 2 },
    { sheet: 1, row: 65, col, kind: 'number', value: 4 },
    { sheet: 1, row: 66, col, kind: 'number', value: 6 },
  ]),
  { sheet: 1, row: 69, col: 2, kind: 'formula', value: '=SUM(C65:C67)' },
  { sheet: 1, row: 69, col: 3, kind: 'formula', value: '=AVERAGE(D65:D67)' },
  { sheet: 1, row: 69, col: 4, kind: 'formula', value: '=COUNT(E65:E67)' },
  { sheet: 1, row: 69, col: 0, kind: 'text', value: 'Fill examples', format: { bold: true } },
  { sheet: 1, row: 70, col: 0, kind: 'number', value: 2 },
  { sheet: 1, row: 71, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 72, col: 0, kind: 'number', value: 4 },
  { sheet: 1, row: 70, col: 1, kind: 'formula', value: '=A71+$A$71', format: { bold: true } },
  { sheet: 1, row: 70, col: 3, kind: 'text', value: 'Fill me', format: { underline: true } },
  // 独立的条件显示示例 C75:E79：三列同值，两色、三色、正负数据条。
  ...[2, 3, 4].flatMap((col): RustImportCell[] =>
    [-10, 0, 5, 10, 20].map((value, offset): RustImportCell => ({
      sheet: 1, row: 74 + offset, col, kind: 'number', value,
    }))),
  // 查找示例保存在原生数据：emoji 的匹配位置、大小写与公式源分别可验收。
  { sheet: 1, row: 84, col: 0, kind: 'text', value: '😀alpha alpha' },
  { sheet: 1, row: 84, col: 1, kind: 'text', value: 'ALPHA' },
  { sheet: 1, row: 84, col: 2, kind: 'formula', value: '=LEN("alpha")' },
  // 通配符示例：三个普通字符、字面星号与单个 emoji。
  { sheet: 1, row: 85, col: 0, kind: 'text', value: 'SKU-100' },
  { sheet: 1, row: 85, col: 1, kind: 'text', value: 'SKU-200' },
  { sheet: 1, row: 85, col: 2, kind: 'text', value: 'SKU-*' },
  { sheet: 1, row: 86, col: 0, kind: 'text', value: 'SKU-😀' },
  // 状态栏示例 A93:F93：数值 4 个，和 26，平均 6.5；文本数字和布尔不计数。
  { sheet: 1, row: 92, col: 0, kind: 'number', value: 10 },
  { sheet: 1, row: 92, col: 1, kind: 'number', value: 0 },
  { sheet: 1, row: 92, col: 2, kind: 'number', value: -4 },
  { sheet: 1, row: 92, col: 3, kind: 'formula', value: '=A93*2' },
  { sheet: 1, row: 92, col: 4, kind: 'text', value: '30' },
  { sheet: 1, row: 92, col: 5, kind: 'boolean', value: true },
  // A94:C94 看似空白或报错，但都有内容：非空计数为 3，数值计数为 0。
  { sheet: 1, row: 93, col: 0, kind: 'text', value: '' },
  { sheet: 1, row: 93, col: 1, kind: 'formula', value: '=""' },
  { sheet: 1, row: 93, col: 2, kind: 'formula', value: '=1/0' },
  // 数字格式会话示例：文本编号不丢精度，日期仍存原始序号；预览读取这些原生值。
  { sheet: 1, row: 95, col: 0, kind: 'text', value: '12345678901234567890',
    format: { numberFormat: { kind: 'text' }, bold: true } },
  { sheet: 1, row: 95, col: 1, kind: 'text', value: '00123',
    format: { numberFormat: { kind: 'text' } } },
  { sheet: 1, row: 95, col: 2, kind: 'number', value: 45351,
    format: { numberFormat: { kind: 'date', pattern: 'dd-mmm-yy' }, italic: true } },
  // 去重 D32:F37：只比较 D/E；大小写及空白选项决定保留哪些记录，F 随记录移动。
  { sheet: 1, row: 31, col: 3, kind: 'text', value: 'Key', format: { bold: true } },
  { sheet: 1, row: 31, col: 4, kind: 'text', value: 'Group', format: { bold: true } },
  { sheet: 1, row: 31, col: 5, kind: 'text', value: 'ID', format: { bold: true } },
  { sheet: 1, row: 32, col: 3, kind: 'text', value: 'Maple' },
  { sheet: 1, row: 32, col: 4, kind: 'text', value: 'East' },
  { sheet: 1, row: 32, col: 5, kind: 'text', value: 'M1', format: { italic: true } },
  { sheet: 1, row: 33, col: 3, kind: 'text', value: 'Maple' },
  { sheet: 1, row: 33, col: 4, kind: 'text', value: 'East' },
  { sheet: 1, row: 33, col: 5, kind: 'text', value: 'M2' },
  { sheet: 1, row: 34, col: 3, kind: 'text', value: 'maple' },
  { sheet: 1, row: 34, col: 4, kind: 'text', value: 'East' },
  { sheet: 1, row: 34, col: 5, kind: 'text', value: 'M3' },
  { sheet: 1, row: 35, col: 3, kind: 'text', value: ' Maple ' },
  { sheet: 1, row: 35, col: 4, kind: 'text', value: 'East' },
  { sheet: 1, row: 35, col: 5, kind: 'text', value: 'M4' },
  { sheet: 1, row: 36, col: 3, kind: 'text', value: 'Pine' },
  { sheet: 1, row: 36, col: 4, kind: 'text', value: 'West' },
  { sheet: 1, row: 36, col: 5, kind: 'text', value: 'P1', format: { underline: true } },
  // D32:F39 复用上述大小写样本；这两条记录的 D/E 真正留空，用于空格排序。
  { sheet: 1, row: 37, col: 5, kind: 'text', value: 'empty-a' },
  { sheet: 1, row: 38, col: 5, kind: 'text', value: 'empty-b' },
  // 原生分列：E97:E98 按逗号拆到 B97，C98 用于测试覆盖确认；E99 按 2,5 定宽拆。
  { sheet: 1, row: 96, col: 4, kind: 'text', value: '"North, America",001,Ready' },
  { sheet: 1, row: 97, col: 4, kind: 'text', value: '"Asia",002,"On hold"' },
  { sheet: 1, row: 98, col: 4, kind: 'text', value: '北京😀AB007' },
  // E95 拆到 B95：常规／DMY 日期／跳过／文本；复用已有长文本列，保留 F 列自动适应样例。
  { sheet: 1, row: 94, col: 4, kind: 'text', value: '001,29/02/2024,ignore,=1+2' },
  // E96 按分号拆到 B100：前两列 General，小数逗号／千位点／允许尾随负号。
  { sheet: 1, row: 95, col: 4, kind: 'text', value: '1.234,50;12,50%-;001' },
  { sheet: 1, row: 97, col: 2, kind: 'text', value: 'Existing destination', format: { italic: true } },
  // 离屏内容参与自动适应；仅给演示数据加格式，不在 React 写坐标特判。
  {
    sheet: 1,
    row: 89,
    col: 4,
    kind: 'text',
    value: 'Offscreen customer — Northwind International',
    format: { bold: true, fontSize: 14 },
  },
  {
    sheet: 1,
    row: 89,
    col: 5,
    kind: 'text',
    value: '第一行\nSecond line\n第三行',
    format: { italic: true, wrap: true },
  },
  {
    sheet: 1,
    row: 89,
    col: 7,
    kind: 'formula',
    value: "='Sales Orders'!G2*1000000",
    format: { numberFormat: { kind: 'number', digits: 2, thousands: true } },
  },
  {
    sheet: 1,
    row: 14,
    col: 0,
    kind: 'text',
    value: 'Merged heading',
    format: { bold: true, align: 'center', bgColor: '#e9edff',
      borders: { bottom: { style: 'thick', color: '#c00000' } },
    },
  },
  // 合并格 A15:D15 的 C15 底边单独为蓝色，空白覆盖格只存原生样式。
  { sheet: 1, row: 14, col: 2, kind: 'null',
    format: { borders: { bottom: { style: 'thin', color: '#123abc' } } },
  },
  {
    sheet: 1,
    row: 16,
    col: 0,
    kind: 'text',
    value: 'Two-row merged cell',
    format: { verticalAlign: 'center', bgColor: '#fff2cc' },
  },
]

/** 尺寸示例属于表的行列属性，不属于上面的单元格。 */
export const SUMMARY_SIZES = {
  rowHeights: [{ rowIndex: 0, heightPx: 40 }],
  colWidths: [{ colIndex: 0, widthPx: 200 }],
} as const

/** 恢复隐藏即可看到第 10 行和 G 列的原始示例内容。 */
export const SUMMARY_VISIBILITY = { hiddenRows: [9], hiddenColumns: [6] } as const

/** 原生冻结示例：首行总额不随 Summary 纵向滚动。 */
export const SUMMARY_FREEZE = { rows: 1, cols: 0 } as const

/** C65:C67 的 2、4、6：大于 3 的 4、6 由 Rust 条件格式高亮。 */
export const SUMMARY_CONDITIONAL_FORMATS = [{
  scope: { range: { rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2 } },
  rule: { kind: 'cell-value', operator: 'gt', value: '3',
    format: { bgColor: '#ffc7ce', fgColor: '#9c0006' } },
}, {
  // 蓝色规则默认停用：启用后 2 变蓝，上移后 4、6 也由蓝色优先显示。
  scope: { range: { rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2 } },
  rule: { kind: 'cell-value', enabled: false, operator: 'gt', value: '1',
    format: { bgColor: '#d9eaf7', fgColor: '#123456' } },
}, {
  // D 列用相邻 C 列判定：锁住 C 列，但行号按每个目标单元格变化。
  scope: { range: { rowStart: 64, rowEnd: 66, colStart: 3, colEnd: 3 } },
  rule: { kind: 'formula', formula: '=$C65>3', format: { bgColor: '#d9eaf7' } },
}, {
  // E 列最高 1 项（6）为绿色；最低 50% 向下取整为 1 项（2），显示黄色。
  scope: { range: { rowStart: 64, rowEnd: 66, colStart: 4, colEnd: 4 } },
  rule: { kind: 'top-bottom', direction: 'top', count: 1, format: { bgColor: '#e2f0d9' } },
}, {
  scope: { range: { rowStart: 64, rowEnd: 66, colStart: 4, colEnd: 4 } },
  rule: { kind: 'top-bottom', direction: 'bottom', count: 50, percent: true,
    format: { bgColor: '#fff2cc' } },
}, {
  scope: { range: { rowStart: 74, rowEnd: 78, colStart: 2, colEnd: 2 } },
  rule: { kind: 'color-scale', minColor: '#f8696b', maxColor: '#63be7b' },
}, {
  scope: { range: { rowStart: 74, rowEnd: 78, colStart: 3, colEnd: 3 } },
  rule: { kind: 'color-scale', minColor: '#f8696b', midColor: '#ffeb84', maxColor: '#63be7b' },
}, {
  scope: { range: { rowStart: 74, rowEnd: 78, colStart: 4, colEnd: 4 } },
  rule: { kind: 'data-bar', minColor: '#f8696b', maxColor: '#638ec6' },
}] as const

/** 两个原生合并样例；覆盖格不再重复存储内容。 */
export const SUMMARY_MERGES = [
  { rowStart: 14, rowEnd: 14, colStart: 0, colEnd: 3 },
  { rowStart: 16, rowEnd: 17, colStart: 0, colEnd: 1 },
] as const
