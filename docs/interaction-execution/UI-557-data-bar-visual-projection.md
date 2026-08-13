# UI-557：Data Bar 可视化投影

## 状态

已完成（UI-557）。此 issue 独立于 Color Scale 的渐变颜色投影，未修改其代码或测试。

## 目标

把已保存的 `data-bar` 条件格式规则投影为单元格内可访问的条形视觉：条长随同一规则范围内的有限数值变化，并保留原有文本、选择、编辑和错误语义。

## 已有事实来源

- UI-556C 已在 Static、TS Worker 和 WASM Worker 建立每 Sheet 的 canonical 条件格式配置及 revision。
- `DisplayCell.numericValue` 是格式化前的有限数值投影；不可从 locale 化的显示字符串推断业务数值。
- 条件格式规则、范围、优先级和异步生命周期继续由 Core `@einfach` atoms 作为唯一权威状态。

## 实施范围

1. 为 `data-bar` 规则计算同一规则范围的数值边界与归一化比例。
2. 在 Static、TS Worker、WASM Worker 的读取投影中输出纯展示元数据，不在 Solid 组件或 DOM 保存产品状态。
3. 让 Grid overlay/render presenter 消费该元数据，绘制背景条而不遮挡文字、链接、编辑控件或键盘焦点。
4. 覆盖最小值、最大值、全相同值、负值、空白/错误值、冻结/虚拟滚动，以及 Static/TS/WASM 一致性。

## 不在范围内

- 不改 Color Scale 渐变算法或其测试。
- 不新增第二套条件格式配置、DOM sidecar 或框架本地产品状态。
- 不改变条件格式编辑器的保存、ACK、read-back、retry 或 outcome-unknown 安全语义。

## 验收

- 已验证相同 canonical 规则在 Static、TS Worker、真实 WASM Worker 产生等价条形比例；读取窗口只取范围中段时，比例仍按完整规则范围的 min/max 计算。
- 已验证最小/最大、负值、全相同值、非数值、范围外单元格、无规则单元格和首条匹配优先级；WASM 用例证明后续命中的 cell-value 规则不会替换 Data Bar。
- Grid 只消费 adapter→Grid 的瞬态读取投影；条形为 `aria-hidden`、无 `tabindex`、`pointer-events: none`，层级在文字下方。浏览器用例验证编辑时条形隐藏后重现，以及冻结与滚动后比例保持正确。
- 已运行 Static/TS projection 单测、真实 WASM Worker 单测和真实浏览器 TS/WASM E2E；规则更新、切 Sheet 和 stale response 继续使用既有 atom/session/revision 守卫，未新增本地产品状态或 sidecar。

## 性能残余

为保证数值域不依赖当前视口，每次读取与当前窗口相交的 Data Bar 规则都会读取并扫描其完整 canonical scope 的稀疏单元格。因此成本为 `O(相关规则 × 范围内非空单元格)`；后续优化应由引擎提供 canonical 聚合投影，不能以 UI 本地缓存或视口域替代。

## 提交边界

本 issue 的文档与功能实现作为单一独立提交收口，且不得混入 Color Scale 的提交。
