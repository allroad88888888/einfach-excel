# 格式刷

React 读取 `formatPainterAtom`，通过 `runFormatPainterAtom` 发送 arm / sticky / apply / exit。
单击单次、双击连续，目标选区松手后应用；也可以名称框／键盘选区后按 Enter 应用。
Esc（工作簿内任意焦点）或再次点击按钮退出。

调用链：React → UI Core command → Rust clipboard.capture（独立格式刷槽）→
clipboard.paste（仅格式）→ 原生历史及投影。普通复制／剪切快照不受影响。

UI Core 只保存模式、等待／错误反馈、连接身份和快照 token，工作簿样式不进入 atom。
复用既有剪贴板的格式替换、平铺、合并格及保护检查，不维护兼容端口、ticket 或 ledger。
切表或替换连接会使旧会话失效，捕获后源格修改不会改变已捕获格式。
不刷内容、公式、行高、列宽或尚未接入 Rust 的条件格式规则。
