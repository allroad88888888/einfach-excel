# 待负责人裁决的问题（3 条线去重后 1 条）

> 这条答案决定本次破坏性删除的精确范围。

## A. 清理边界

1. **2026-08-13 的旧 React adapter 中，有 9 个 surface 未被当前产品调用，另有 8 个公开值仍支撑
   现有可运行 demo；这 8 个怎么处理？**（`00-1`、`01-1`）

   A 保留当前 demo 必需的最小桥接，先删除 9 个未消费 surface、对应测试与旧 adapter e2e；等每项
   产品能力有替代实现时再逐个移除桥接。这样本轮后 demo 仍可运行。

   B 连当前 demo 正在使用的 `src` adapter 也全部删除，接受 demo 暂时不能构建，下一批再从产品结构
   重写 provider、projection、selection、pointer 与 editing bridge。

   答：
