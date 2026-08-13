# AD-600：内容与渠道

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

状态：**未开始**。前置：[AD-100](AD-100-publish-pipeline.md) 与 [AD-400](AD-400-positioning.md)；落地页尚不可验证时不应发声。

选题原则：写真实的技术决策与踩坑，不写软文。仓内 ADR 与架构裁决本身就是素材。

## 选题与素材

- **AD-601 选题清单定稿** —— 从候选中排序：solid-js 双实例导致 Provider 重挂、filter/sort 为何判给引擎、spill 用 derived atom 实现、双引擎 parity 怎么钉、可见窗口投影为何不建 per-cell atom、headless backend port 设计。
- **AD-602 每篇的受众与渠道映射** —— 哪篇发哪里，避免一稿乱投。
- **AD-603 素材：demo 录屏** —— 核心交互的短录屏。
- **AD-604 素材：GIF 切片** —— 从录屏切出可嵌 README 的片段。
- **AD-605 素材：架构图** —— 三层分层与 backend port 的图，可复用于文章与站点。

## 文章

- **AD-606 / AD-607** —— 文章一「solid-js 双实例踩坑」初稿、定稿与配图。
- **AD-608 / AD-609** —— 文章二「filter/sort 归属裁决」初稿、定稿与配图。
- **AD-610 / AD-611** —— 文章三「双引擎 parity 怎么钉」初稿、定稿与配图。
- **AD-612 / AD-613** —— 文章四「headless backend port 设计」初稿、定稿与配图。
- **AD-614 / AD-615** —— 文章五「React/Vue 适配层落地记」初稿、定稿与配图；依赖 [AD-300](AD-300-framework-adapters.md)。
- **AD-616 中英双语改写口径** —— 同一篇的中英不是互译，各按渠道习惯改写。

## 渠道

- **AD-617 英文渠道清单** —— HN、Reddit 相关子版、dev.to，各自的发帖规范与禁忌。
- **AD-618 中文渠道清单** —— 掘金、知乎、V2EX，同上。
- **AD-619 发布节奏表** —— 哪篇什么时候发，避免同日多投。
- **AD-620 Show HN 落地检查单** —— 发布前确认包可装、demo 可点、README 首屏、作者在线响应窗口。
- **AD-621 Show HN 正文** —— 标题与正文定稿。
- **AD-622 / AD-623 / AD-624** —— Solid 官网 ecosystem、awesome 系列、WASM 生态清单的收录。
- **AD-625 发布后回收** —— 记录各渠道反馈，回写进 [AD-700](AD-700-community.md) 的文档缺口。
