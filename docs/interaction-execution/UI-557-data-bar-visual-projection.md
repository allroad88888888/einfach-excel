# UI-557：Data Bar 可视化投影

## 状态

待实施。此 issue 独立于 Color Scale 的渐变颜色投影，不包含其代码或测试。

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

- 相同 canonical 规则在 Static、TS Worker、WASM Worker 产生等价条形比例。
- 非数值、范围外单元格和无规则单元格不产生条形元数据。
- 渲染层仅消费投影事实；规则更新、切 Sheet 和 stale response 仍受既有 atom/session/revision 守卫。
- 真实浏览器在 TS 与 WASM 后端均验证条形比例和可访问性不回归。

## 提交边界

该文档先独立提交。后续实现必须以单独功能提交落地，且不得混入 Color Scale 的提交。
