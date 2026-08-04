---
title: 接入你自己的 backend
summary: static backend 只在这里出现，用来演示必选 port 契约和可选能力缺失时的平稳降级。
---

## 试试这个

1. 在内存中的小型名册上编辑。
2. 注意标准 Chrome 仍可正常工作。
3. 将它与 Worker/WASM 演示作比较。

## 它是怎么做到的

只有三个 backend 方法是必选的。可选 capability port 会增强 UI；未实现时，对应命令会消失，而不是留下一个半成品的模仿。
