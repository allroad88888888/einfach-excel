# 日期选择器插件

工作区包 `@einfach-excel/plugin-date-picker`，导出 `datePickerPlugin`，尚未发布。
宿主将它传给 `<Spreadsheet plugins={[datePickerPlugin]} />`。演示使用 `?plugins=date-picker`，可在 Sales Orders 的 Order date／Ship date 列（J、K）或 Summary 的 A20 体验。

编辑 `numberFormat.kind === 'date'` 的单元格时，在格内编辑器或公式栏下显示浏览器原生日历输入。
选好日期后点击「使用日期」提交，日期原串由现有 Rust 输入解析、验证、历史链路处理。
键盘：在编辑器里按 Alt+↓ 把焦点移进日历（与 Excel 下拉同键），日历里按 Enter 等同「使用日期」；Tab 保持编辑器原有语义。
「取消日期编辑」或 Escape 取消本次编辑，不改变工作簿。日期格式的公式不会显示替换值的日历。
自定义数字格式目前不自动推断为日期，时间选择不在该插件范围内。

插件只保存本次日历输入草稿，不计算 Excel 日期序号，也不增加工作簿数据模型。
日历的月份导航、键盘操作和语言采用浏览器原生日期控件。
