# @einfach/spreadsheet-ui-styles

## 0.2.0

### Minor Changes

- 5a2e68f: 共享 chrome 对齐 Excel for web：单一皮肤 + 全套暗色。

  **样式(ui-styles)**

  - `chrome-tokens.css` 重做:品牌绿 #217346→#107c41,新增尺寸/字体/弹层影
    token 与 `[data-spreadsheet-theme='dark']` 暗色作用域;chrome 文件全部
    token 化(无裸色值),文本色组合过 AA 并记录在 token 文件头。
  - 网格:单元格底对齐 + Calibri 栈;表头两级选中高亮(触及=浅绿+绿边线,
    整行/列=实心绿);底部条不透明整条。
