# 对外采用与推广：Issue 树

> 本文件是本地的权威 Issue 树：它定义让外部开发者能发现、能安装、能使用、愿意留下的工作单元。
> 父节点住本文，可执行叶子住 [`adoption-issues/`](adoption-issues/)。

## 状态口径

- **完成**：交付物与该叶子的语义一致，且已独立验收；提交号附在直属叶子文档中。
- **局部进展**：已有相关提交，但尚未满足原叶子的完成判定，不能当作完成。
- **未开始**：尚无满足判定的交付物。
- 状态只记录已验证事实；不写投入估算，也不把未来承诺写成现状。

## 使用约束

- 一个叶子是可独立验收的单一交付物；说不清交付物或完成判定时必须继续拆分。
- 技术类叶子遵守仓内可选后端端口、State Decision Template、有界缓存、单实例不变式等约束（见 [CLAUDE.md](../CLAUDE.md) 与 [CONTRIBUTING.md](../CONTRIBUTING.md)）。
- 规模口径只记录可复跑的命令或证据；不写会腐坏的全局计数。

## 发布口径裁决

原先阻塞 AD-100 的五项已由维护者裁决，各自落成 ADR。裁决解除的是“不知道该做什么”，
不改变裁决时点任何叶子的完成状态（当时下列叶子全部未开始）；此后的实施进度以下方树
与「已完成叶子」表为准：

| 原编号 | 裁决                                                                          | 影响的叶子             |
| ------ | ----------------------------------------------------------------------------- | ---------------------- |
| D1     | [ADR 0014](decisions/0014-publish-excel-core-ts.md)：`@einfach/excel-core-ts` 公开发布 | AD-115、AD-119、AD-120 |
| D2     | [ADR 0015](decisions/0015-wasm-distribution-single-package.md)：`@einfach/excel-wasm` 单包双入口，CI 预构建 | AD-101~110             |
| D3     | [ADR 0016](decisions/0016-ci-only-npm-publish.md)：只走 CI 发布，凭据填入仓库 secret | AD-132、AD-133、AD-137 |
| D4     | [ADR 0017](decisions/0017-initial-release-version-0-1-0.md)：首发版本 `0.1.0`  | AD-129~131、AD-712     |
| D5     | [ADR 0018](decisions/0018-node-baseline-22-12.md)：Node 基线 `>=22.12.0`       | AD-121、AD-136~141     |

## 一句话现状

站点、demo、CI、双语文档与双引擎 parity 均存在，但 npm 上仍没有经过离体验证的可安装包。发布口径的五项裁决已落定（见上节），WASM 交付已按 ADR 0015 迁移为 `@einfach/excel-wasm` 单包并经离体验证（`38d7d5b`）；`@einfach/solid-excel` 的产物形态、内部依赖版本替换与发布流程仍待实施，因此 **AD-100 仍是发布与上手路径的硬阻塞**。

## 当前汇总

| 总叶子 | 完成并独立验收 |               验收契约阻塞 | 未开始 |        其中待决策 |
| -----: | -------------: | -------------------------: | -----: | ----------------: |
|    235 |            154 | 1（AD-505 验收契约待明确） |     80 |                 0 |

AD-505 在明确基准页路由、启动方式、场景登记与无场景行为的验收契约前保持阻塞，不能记为完成。原 AD-100/D1~D5 五项待决策已裁决为 ADR 0014~0018，因此“其中待决策”归零；这不改变未开始叶子的数量。

## 树

- AD-000 对外采用与推广（总控）
  - [**AD-100 让人装得上（发布链路）**](adoption-issues/AD-100-publish-pipeline.md) —— 硬阻塞；口径已裁决（ADR 0014~0019）；AD-101~118、AD-120~126、AD-128~130 完成；AD-119 局部进展；其余尚未闭环
    - AD-101~114 WASM 分发、引用切换与回归
    - AD-115~124 `@einfach/solid-excel` 可发布性
    - AD-125~128 `@einfach/spreadsheet-ui-core` 元数据与离体验证
    - AD-129~135 版本与发布流程
    - AD-136~142 本地 registry 与装机冒烟
  - [**AD-200 让人五分钟内跑起来**](adoption-issues/AD-200-onboarding.md) —— 受 AD-100 全组阻塞
  - [**AD-300 框架适配层（React / Vue）**](adoption-issues/AD-300-framework-adapters.md) —— AD-311~325、AD-331~354、AD-361~384、AD-391、AD-392、AD-394、AD-395 完成；其余独立长线
  - [**AD-400 定位与可信度**](adoption-issues/AD-400-positioning.md) —— AD-401~407、AD-408~412、AD-416~420 完成；其余可与 AD-100 并行
  - [**AD-500 可验证的性能证据**](adoption-issues/AD-500-performance.md) —— AD-501~504、AD-509、AD-511~514、AD-516、AD-517 完成；AD-505 等待验收契约明确，其余未开始
  - [**AD-600 内容与渠道**](adoption-issues/AD-600-content-channels.md) —— 依赖 AD-100、AD-400
  - [**AD-700 承接进来的人**](adoption-issues/AD-700-community.md) —— AD-701、AD-702、AD-705、AD-706、AD-708~710、AD-713 完成
  - [**AD-800 规模能力与技术差异化**](adoption-issues/AD-800-scale-differentiation.md) —— AD-801~807、AD-810~811、AD-813~817、AD-819~827 完成

## 已完成叶子

| 叶子   | 交付                      | 独立验收的提交                                                                         |
| ------ | ------------------------- | -------------------------------------------------------------------------------------- |
| AD-101 | excel-wasm 包骨架         | `38d7d5b`                                                                              |
| AD-102 | lite 产物落位             | `38d7d5b`                                                                              |
| AD-103 | full 产物落位             | `38d7d5b`                                                                              |
| AD-104 | 打包候选核对              | `38d7d5b`                                                                              |
| AD-105 | exports 面                | `38d7d5b`                                                                              |
| AD-106 | strip 脚本接入            | `38d7d5b`                                                                              |
| AD-107 | 类型导出核对              | `38d7d5b`                                                                              |
| AD-108 | 产物离体核对              | `38d7d5b`                                                                              |
| AD-109 | lite 引用切换             | `38d7d5b`                                                                              |
| AD-110 | full 引用切换             | `38d7d5b`                                                                              |
| AD-111 | ensureWasm 与 CI 同步     | `38d7d5b`                                                                              |
| AD-112 | 构建工具路径同步          | `38d7d5b`                                                                              |
| AD-113 | 测试侧路径同步            | `38d7d5b`                                                                              |
| AD-114 | e2e 回归                  | `38d7d5b`                                                                              |
| AD-115 | Solid 产物形态裁决        | `8aadfff`（ADR 0019）                                                                  |
| AD-116 | 双形态构建管线            | `8aadfff`                                                                              |
| AD-117 | exports 双形态重写        | `8aadfff`                                                                              |
| AD-118 | files 发布白名单          | `8aadfff`                                                                              |
| AD-120 | workspace 协议替换验证    | `8aadfff`                                                                              |
| AD-121 | peer 边界与 engines 口径  | `8aadfff`                                                                              |
| AD-124 | solid-excel 产物离体核对  | `8aadfff`                                                                              |
| AD-129 | 版本策略落地              | `8aadfff`                                                                              |
| AD-130 | fixed 组配置与联动        | `8aadfff`                                                                              |
| AD-122 | vnext CSS 副作用保留      | `da50614367dd3f751b99eafa5f29c287ae4553b1`                                             |
| AD-123 | 单实例风险表达            | `5d97a76453f617677f9b77237a5534ae076a93bf`                                             |
| AD-125 | 仓库指向修正              | `20ff4651001b779af604944f5c4f3972cf7cb168`                                             |
| AD-126 | exports 字段补齐          | `20ff4651001b779af604944f5c4f3972cf7cb168`                                             |
| AD-128 | ui-core 产物离体核对      | `20ff4651001b779af604944f5c4f3972cf7cb168`                                             |
| AD-311 | Solid 耦合点清单          | `9c8aaac`                                                                              |
| AD-312 | Grid 可移植性边界         | `77a692eae9e1e19ab5ee5138f9941e5094736848`                                             |
| AD-313 | 编辑与选区可移植性边界    | `9660fb8`                                                                              |
| AD-314 | 非 grid 交互可移植性边界  | `b291fbb`                                                                              |
| AD-315 | 下沉目标位置裁决          | `96a3b96b7feb0b697e91e004a772092a2b3fe700`                                             |
| AD-316 | viewport 滚动几何下沉     | `bc0ad7d5172b76d11a4446448c3c14fbc514b031`                                             |
| AD-317 | grid 坐标辅助函数下沉     | `bca3d51`                                                                              |
| AD-318 | 非 grid 交互下沉          | `e62105f`                                                                              |
| AD-319 | 下沉后真实 worker 回归    | `6892e3b`                                                                              |
| AD-320 | Headless 挂载契约         | `e8a07366ed4a7d57cecb56087ddc40e9b6a4d3bb`                                             |
| AD-321 | DOM 测量抽象              | `8c6ab2df3fc35fc90db8ea50cf6d89c8e685bc07`                                             |
| AD-322 | vanilla 只读投影 POC      | `59e9e2f`                                                                              |
| AD-323 | vanilla 编辑 POC          | `71c2f9ce`、`204a091`                                                                  |
| AD-324 | 框架无关样式层独立        | `96fb693`、`36abe08`                                                                   |
| AD-325 | 档 1 范围冻结             | `41ddb19`                                                                              |
| AD-331 | React 包骨架              | `db0637c`                                                                              |
| AD-332 | React 订阅桥              | `44be7f3`、`dd2afcd`                                                                   |
| AD-333 | React 并发正确性验证      | `5a780b5`                                                                              |
| AD-334 | React UI Provider         | `5cc47852b2522748bee5bcadfd8873c695411cd7`                                             |
| AD-335 | React worker backend port | `6b17a0a`                                                                              |
| AD-336 | React 网格几何适配器      | `f65917e0b2ad2334e3a72646d0593df166656709`                                             |
| AD-337 | React 只读网格视图        | `bdb9b85`                                                                              |
| AD-338 | React 受控 viewport hook  | `a835f24d1e98e318f83b016fda09f3ccbe996d2c`                                             |
| AD-339 | React 冻结网格投影        | `754a005df83996f54595ed22ffd01fbf0aeaf304`                                             |
| AD-340 | React 投影格式渲染        | `dec38531065021058c780f6ff0b5768b27e35daa`                                             |
| AD-341 | React 选区快照桥          | `aca65df`                                                                              |
| AD-342 | React 指针选区绑定        | `7fa5ecc`                                                                              |
| AD-343 | React 键盘导航绑定        | `3cd7526`                                                                              |
| AD-344 | React 编辑绑定            | `9decbd7`                                                                              |
| AD-345 | React IME 组合输入绑定    | `20fd61e`                                                                              |
| AD-346 | React 公式栏绑定          | `197e219`                                                                              |
| AD-347 | React 名称框绑定          | `894473d`                                                                              |
| AD-348 | React Sheet Tabs 绑定     | `05baa4803ea9ac4fa1f8b55257232e0f1cf049e4`                                             |
| AD-349 | React 剪贴板桥            | `b604a100d8f11de2a14535eb99611cb159164587`                                             |
| AD-350 | React 历史桥              | `c905c658286db96da52c8e87ccf562dd879677db`                                             |
| AD-351 | React 默认 Provider 隔离  | `2afdb5ff709e44f05cec0de7d6112c6c4a9e57d4`                                             |
| AD-352 | React 浏览器选区 e2e      | `f06398b5162e58129eacd85e9bc25789c8ac857e`                                             |
| AD-353 | React 站点 demo           | `300daac1e32b44f1a0e5715563077706af6264d1`、`850a1f9a2e3f5533d296125e8f937f9bc22eb240` |
| AD-354 | React 包 README           | `c237648`、`0149f9b`                                                                   |
| AD-361 | Vue 包骨架                | `a95b0b0`                                                                              |
| AD-362 | Vue 订阅桥                | `0434370`                                                                              |
| AD-363 | Vue 订阅回收验证          | `8462820`                                                                              |
| AD-364 | Vue Provider/context      | `cfaabbb`                                                                              |
| AD-365 | Vue worker backend port   | `4292868d9f598100c612f262a6577eae4f186351`                                             |
| AD-366 | Vue 网格几何适配器        | `602bc864f451a4c085f1e9e3b4862d4336241de2`                                             |
| AD-367 | Vue 只读网格视图          | `1ee0f44`                                                                              |
| AD-368 | Vue viewport controller   | `729760428eefde1bebf452c58fa1620121b7cfd2`                                             |
| AD-369 | Vue 冻结网格投影          | `e2afa2be43db6a36b9836fc73f7807f2a2fa8c06`                                             |
| AD-370 | Vue 投影格式渲染          | `7c509c2a7afe18442ece749a6be2fff5751d3af5`                                             |
| AD-371 | Vue 选区快照桥            | `7e70d2f`                                                                              |
| AD-372 | Vue 指针选区桥            | `e1ac7c8`                                                                              |
| AD-373 | Vue 键盘导航绑定          | `26b1381`                                                                              |
| AD-374 | Vue 编辑绑定              | `32246b6`                                                                              |
| AD-375 | Vue IME 组合输入绑定      | `667eb88`                                                                              |
| AD-376 | Vue 公式栏绑定            | `fa0d5c731c15831cc56041e6e5551743b23d98ed`                                             |
| AD-377 | Vue 名称框绑定            | `4b2e57a6729923e805863c5919d367cce40ea542`                                             |
| AD-378 | Vue Sheet Tabs 绑定       | `ff623c0f4d5532ecd1be4f987c3a81c189b1eb87`                                             |
| AD-379 | Vue 剪贴板桥              | `f25a1b8b42253ba17ab02c49df9d97e42072e711`                                             |
| AD-380 | Vue 历史桥                | `6674c05`                                                                              |
| AD-381 | Vue SFC 消费形态          | `b2f4b2b6bfc3428ef57181a0a62cfbee4b767921`、`133fd14957e9a43bb16c68b56278c65eda17e309` |
| AD-382 | Vue 浏览器选区 e2e        | `b05310bd89959774ac66980c233fc18efa70ab68`                                             |
| AD-383 | Vue 站点 demo             | `bcba04f0fcadc4179ba06f09a18c561533b8e82c`                                             |
| AD-384 | Vue 包 README             | `4e4f04d`                                                                              |
| AD-391 | 适配器行为分歧裁决规程    | `a99e3fbb2ff7e154cd6c3bc6d8f709e0e4704eaf`                                             |
| AD-392 | 框架 × 后端 E2E 证据矩阵  | `224fc56c7240c9cd1cd038354a841db6879e9907`、`c552b5158ee8a3f65d84d76644358fcdeb752a1c` |
| AD-394 | 宿主适配器信息架构        | `960feb46202e5301d6fe630990895bf3c0ae0b4a`                                             |
| AD-395 | 框架 demo 发现契约        | `f3643873f192b7a20b4d93f38210adfd898b6390`                                             |
| AD-401 | 一句话定位定稿            | `a908ba8`                                                                              |
| AD-402 | 与 Univer 的差异段        | `d3f9504`                                                                              |
| AD-403 | 定位的诚实边界            | `639934abcaed18f0f9cfd839160634cd19ad8f1b`                                             |
| AD-404 | 非规模产品对比维度        | `e951719`                                                                              |
| AD-405 | Univer 产品事实证据       | `29e921d`                                                                              |
| AD-406 | Handsontable 产品事实证据 | `af70c3c`、`8eb91a8`                                                                   |
| AD-407 | 带核实日期的对比表入口    | `d91e209eb02c79ca51aaf7d2cdffd87ca0d2d290`                                             |
| AD-408 | 对比证据维护规程          | `a2dfa0280dbf484a106c04d652f1d98931532b06`                                             |
| AD-409 | README 采用旅程重排       | `18d26279eca888298129c0d183319e870e9585f4`                                             |
| AD-410 | 可复跑可信度验证命令      | `74d04d6`                                                                              |
| AD-411 | 中文可复跑验证说明        | `c276f9f`                                                                              |
| AD-412 | 版本阶段与不支持项        | `3fce3d2`                                                                              |
| AD-416 | social preview 图         | `7ec345e`                                                                              |
| AD-417 | 英文落地页可用性边界      | `6381818`                                                                              |
| AD-418 | 中文落地页可用性边界      | `a3b5f165243fa7d73dd6fea57fda342d3b1f1de0`                                             |
| AD-419 | `llms.txt` 定位对齐       | `9193e169edc835c9a45c2725a5335dc7c0856adf`                                             |
| AD-420 | agent 集成说明            | `d39f61d`                                                                              |
| AD-501 | 对外性能证据范围          | `9453733`                                                                              |
| AD-502 | 对外性能测量方法          | `bb64fe9`                                                                              |
| AD-503 | 对外性能非承诺            | `47baf17`                                                                              |
| AD-504 | 对外性能环境记录格式      | `3422994`                                                                              |
| AD-509 | 数据规模档位              | `be04fef`                                                                              |
| AD-511 | WASM 体积测量候选协议     | `03d17048911cfe3c4d350fb61141b2126e9e0164`                                             |
| AD-512 | WASM 候选构建物组成测量   | `2491da7`                                                                              |
| AD-513 | WASM lite/full 取舍说明   | `88e1046`                                                                              |
| AD-514 | WASM 瘦身可行性评估       | `ba7272d`                                                                              |
| AD-516 | 公共性能基准 CI 接入决策  | `99e774f`                                                                              |
| AD-517 | 竞品同口径对照决策        | `a54de02`                                                                              |
| AD-701 | Bug issue 模板            | `a124092`                                                                              |
| AD-702 | 功能请求 issue 模板       | `e1413c4`                                                                              |
| AD-705 | 社区行为准则范围          | `d9bcdc2544ec5b3ad266d2aa4703276b695a114e`                                             |
| AD-706 | 无 Rust 工具链贡献路径    | `0625229`                                                                              |
| AD-708 | fork 到 PR 最短路径引导   | `f0a6c52`                                                                              |
| AD-709 | 贡献指南外部可读性走查    | `21812bc`                                                                              |
| AD-710 | 对外路线图                | `24143a3`                                                                              |
| AD-713 | 外部反馈文档回写机制      | `24555ec`                                                                              |
| AD-801 | 规模事实清单              | `e3cce29`                                                                              |
| AD-802 | Tier 分层机制说明         | `2134b04`                                                                              |
| AD-803 | 稀疏存储模型说明          | `2919fed`                                                                              |
| AD-804 | 有界性契约映射            | `61bf5c1`                                                                              |
| AD-805 | 规模架构综合说明          | `2fa9f3f`                                                                              |
| AD-806 | 千万非空单元确定性种子    | `7e98b0e`                                                                              |
| AD-807 | 千万级加载边界观察        | `4a2ab4e`、`c815e39`                                                                   |
| AD-810 | 原子导入 session 边界观察 | `bcfc527d0c858cded939b23427aac07feb26b638`                                             |
| AD-811 | 规模内存测量规程          | `c96547e63234b6bfe64b2930ab7263b94a903c62`                                             |
| AD-813 | 规模实测结论回写          | `11a2a4aecaadde88e4059124c995a0412bd05064`                                             |
| AD-814 | 规模与架构对比维度        | `fa834e2a51e98e8ee86f0a3ddc1ca44cf5a76b17`                                             |
| AD-815 | Univer 规模与架构事实证据 | `7d87edd`                                                                              |
| AD-816 | Handsontable 规模事实证据 | `3c5aa0a`                                                                              |
| AD-817 | 规模对比证据矩阵          | `8c01935`                                                                              |
| AD-819 | 技术白皮书                | `5d4fa41`                                                                              |
| AD-820 | README 首屏规模边界契约   | `c9f3c1c`                                                                              |
| AD-821 | 按需求值机制成文          | `fe8e6a1`                                                                              |
| AD-822 | 跨 sheet 按需求值成文     | `ae7f5bc`                                                                              |
| AD-823 | 懒求值归档件与现状复核    | `62755dc`、`fbdf800`                                                                   |
| AD-824 | 投影边界约束成文          | `336c449`                                                                              |
| AD-825 | Worker 载荷字节遥测       | `b8c4e226`、`56ca8bb`                                                                  |
| AD-826 | 首屏实际公式求值观察      | `4f6bc662db1bc823c50fab9373f21a749d33f221`                                             |
| AD-827 | 有界与全范围读取观察      | `19bb65a2466e9325c4da52cc97cdd075f2964fc7`                                             |

## 关键路径

```text
AD-100 ──► AD-200 ──► AD-600
   │                     ▲
   └────── AD-400 ───────┘

AD-310 ──┬──► AD-330 React ──┐
         └──► AD-360 Vue    ──┴──► AD-390 ──► AD-614
```

- AD-100 是唯一发布硬阻塞；先消除“能否安装”的未知数，才能验证 AD-200。口径裁决（ADR 0014~0018）已不再是阻塞项，缺的是实施与离体验证。
- AD-400 可与 AD-100 并行，但必须早于 AD-600；AD-700 应在对外发声前就位。
- AD-300 不阻塞其余组；AD-310 是 React 与 Vue 两线的共同前置。
- AD-823 已完成现状复核，AD-821/822/824 的完成状态以该复核后的契约为准；AD-825~827 已完成可复跑实测，AD-828~829 仍缺远程路径演示，不能声称具体传输或计算优势。
