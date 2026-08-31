# 018 独立审查

**APPROVED**。指定范围内未发现阻断或重要语义回归；C-013/C-018 均通过。执行报告中的测试结果按要求未重跑，作为残余验证风险保留。

## 质量发现

无 Critical / Major / Minor 发现。

非阻断说明：`worker-runtime-ts.ts` 当前为 662 行，仍超过普通文件 300 行与复杂文件 500 行上限；它是本轮连续抽取中的存量装配壳，本任务已将其由 774 行降至 662 行，报告亦明确由 019 继续关闭。018 新增模块本身没有借压缩格式或假拆分规避规则，因此本项不作为本叶拒绝理由。

## 验收标准逐条核验

1. **通过：lifecycle 文件不超过 300 行。** `wc -l` 静态结果为 149 行。
2. **按报告通过，未独立重跑。** `018-report.md` 记录指定 Jest 为 3/3 suites、6/6 tests 全绿；本审查遵照要求不重跑测试。
3. **按报告通过，未独立重跑。** `018-report.md` 记录项目 TypeScript 检查零错误。
4. **通过。** 当前装配壳没有顶层 `function rebuildPreservingCells`；实现已收口到 `sheet-lifecycle.ts:46-96` 的 lifecycle 闭包内部。

## C-013：sheet lifecycle parity

- **init。** `sheet-lifecycle.ts:99-110` 使用统一 workbook factory 重新生成 sheet registry，替换 workbook/sheets，清空 custom formula、viewport、conditional format、import/snapshot session，并将两类 session id 计数器重置为 1；这与显式初始化的全量 reset 语义一致。空 sheet 列表仍由 `makeWorkbookFor` 回落到默认 Sheet1。
- **add / rename / remove / move。** `sheet-lifecycle.ts:113-146` 保留原命令返回值与校验顺序。新 registry 继续由 `makeWorkbookFor` 生成连续的 `sheet-${idx + 1}` id、零基连续 idx 和命令所得 name。add 追加并返回旧长度；rename 先断言 sheet、trim 名称并拒绝空名；remove 拒绝删除唯一 sheet；move 对 source/target 都做 sheet 校验并按目标位置重排。
- **cell restore。** `sheet-lifecycle.ts:51-61,82-91` 在旧 workbook 上读取存活 sheet 的 cell map，按 sheet name 优先、旧 idx 回退寻找来源。带 AST 的 cell 以原始 `cell.input` 交给 `bulkApply` 重新解析公式；非公式以 `cell.value` 的 typed value 恢复，不会把文本 `00123` 重新分类为数字。remove 会在快照阶段排除被删除 idx，避免位置回退把已删除数据灌入后继 sheet。
- **custom formula。** workbook 和 cells 全部替换/恢复后，`sheet-lifecycle.ts:95` 调用 016 服务重绑 registry；服务对同步与异步公式均从唯一的 `state.customFormulas` 重注册，未建立第二份 formula 状态。
- **viewport。** init 通过注入服务 reset 两张尺寸 map；rename/remove 分别在成功 rebuild 后按旧名迁移、删除尺寸。add/move 保持以 sheet name 为 key 的尺寸状态，因此顺序变化不会错绑。
- **print / conditional format。** `sheet-lifecycle.ts:64-80` 在替换 state 前生成迁移快照：两者均以名称匹配为主、位置回退支持 rename，并排除 removed idx；print config 被恢复进新 workbook，conditional-format revision/rules 被克隆到新 sheet id，未另设 adapter mirror。
- **session invalidation 与防碰撞。** 每次结构 rebuild 在 `sheet-lifecycle.ts:93-94` 清空 import/snapshot session，令旧游标 fail closed；没有修改 `nextImportSessionId` / `nextSnapshotSessionId`，所以新自动 id 继续递增，不会与失效的旧 id 碰撞。只有显式 init 才将计数器归 1，符合新 workbook session epoch 的原行为。

上述实现与基线 `rebuildPreservingCells` 及五个 dispatcher 分支逐段等价；唯一可观察的小差别是 move 的非法 target 现在复用 `assertSheet`，错误 message 从“invalid target sheet index”统一为“invalid sheet index”，错误 code 仍为 `INVALID_SHEET`，不构成契约回归。因此 C-013 在本叶静态范围内通过。

## C-018：职责、依赖与状态所有权

`sheet-lifecycle.ts` 可以用一句话描述为“原子执行 sheet registry 生命周期迁移”，149 行且内部代码互相围绕同一 rebuild 流程，不存在两组互不调用的 exports，也没有 `utils/common/part` 式假拆分。

依赖由 `SheetLifecycleServices` 显式声明，并在 `worker-runtime-ts.ts:225-236` 的装配点注入；新模块只导入 core 类型、conditional-format 类型和 `RuntimeState/SheetEntry` 类型，没有反向导入装配壳。workbook、sheet registry、custom formulas、viewport maps、conditional formats 与 session maps 仍全部唯一存放在 `RuntimeState`，lifecycle 只是协调已有所有者，没有第二份长期状态。因此 C-018 在 018 范围内通过。

## 验证边界

本审查直接阅读了任务、执行报告、范围 diff、新文件及其 013–017 注入服务，并与任务基线实现静态对照；未重跑 Jest、TypeScript 或浏览器 E2E。执行报告已记录指定测试、补充 worker 测试与 TypeScript 检查通过，但完整双后端浏览器证据仍由后续汇总任务承担。

一句话回执：**APPROVED — 018 的 init/add/rename/remove/move/rebuild 抽取保持 sheet identity、cell/formula、custom formula、viewport、print/conditional-format 与 session 失效语义，并满足显式依赖及 C-018 单一职责要求。**
