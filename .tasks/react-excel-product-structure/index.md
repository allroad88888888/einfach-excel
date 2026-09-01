# React Excel · 完整产品目录扶正

创建：2026-09-01

状态：running

## 目标

把 `excel/react-excel` 从“旧 adapter 包 + 临时 demo”扶正为可持续建设的完整 Vite 产品，同时保持
现有 Rust/WASM 工作簿、1000 行投影、选择与单格编辑可运行。

## 目标目录

```text
excel/react-excel/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── src/
│   ├── main.tsx
│   ├── app/                    # 应用启动与全局样式
│   └── workbook/
│       ├── Workbook.tsx       # 工作簿页面组合
│       ├── backend/            # Rust worker 创建与种子导入
│       ├── chrome/             # header/ribbon/formula/footer
│       ├── data/               # 销售订单演示数据定义
│       ├── editing/            # 编辑会话与单格编辑用例
│       ├── grid/               # 网格 DOM、窗口网格与 editor
│       ├── projection/         # 可见窗口与 Rust 投影
│       ├── runtime/            # React/UI-core runtime 边界
│       └── selection/          # 选择读取与指针选择
└── test/workbook/             # 当前产品三条端到端组件链
```

禁止建立 `components/`、`hooks/`、`utils/` 大杂烩；不建立 barrel。文件按业务域归属，并能用一句
不含“和/以及”的话说明职责。

## 全局约束

- 删除旧 `excel/react-excel/e2e/**` 与旧 adapter root surface；不得保留兼容 re-export。
- `demo/` 最终不存在；Vite 的 `index.html`、config 与 app source 升为包根产品入口。
- 现有产品需要的最小 React/UI-core bridge 可迁移为 workbook 内部模块，不再作为通用 package API。
- 只接现成 `@einfach/solid-excel/vnext-worker-runtime?worker` Rust/WASM worker；禁止 TS core/runtime/fallback。
- 保持 1000 条数据、bounded DOM window、单击/拖选、连续双击编辑、Enter/blur 写回与 Escape 取消。
- 不增加任何新用户功能，不顺手接 ribbon、公式栏、history、clipboard 或 sheet command。
- 普通文件 `wc -l` ≤300；每文件只负责一个业务点或抽象。
- 执行 agent 不提交、不改任务状态；每叶独立 review 后由编排者提交。

## 任务树

```text
001 把 demo 升成产品目录
 └─ 002 移除旧 adapter 与 e2e
```

| id | 交付点 | status | base | report | review |
|---|---|---|---|---|---|
| 001 | 产品入口与业务目录落位 | done (R2) | 1b842837fae6a90b029846a6e5298640d429f223 | reports/001-report.md | reports/001-review-v2.md |
| 002 | 内部 bridge 落位并清空旧文件 | pending | pending | pending | pending |

## 裁决与代价

- 裁决：重建标准 Vite `src`，而不是把 demo 文件平铺包根 — 完整应用需要稳定业务目录；如果理解错，
  用户想要的是根级散文件，代价是多了一层 `src`，但避免了下一批功能继续堆乱。
- 裁决：先迁应用再删 adapter — 每个 commit 都能构建和验收；代价是 001 结束时旧 adapter 暂存一轮。
- 裁决：删除旧 adapter unit/e2e，只保留当前产品三条测试链 — 旧测试锁的是已废弃 public API；代价是
  内部 bridge 的细粒度覆盖下降，后续功能按产品验收重新补。
- `.project-lines` 按用户要求暂停，不作为本树执行输入，也不随本树更新。
