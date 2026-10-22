---
id: '001'
title: 外部项目可安装并嵌入完整工作簿
kind: leaf
parent: null
depends_on: []
model: gpt-6.1-sol
status: done
created: 2026-10-22
done: 2026-10-22
base: 08caefbce8cb4934ceea4f0c26115d910569a47c
files:
  - excel/react-excel/package.json
  - excel/react-excel/vite*.ts
  - excel/react-excel/tsconfig*.json
  - excel/react-excel/src/index.ts
  - excel/react-excel/src/Spreadsheet.tsx
  - excel/react-excel/src/worker/**
  - excel/react-excel/src/page/WorkbookRuntimeProvider.tsx
  - excel/react-excel/test/package/**
  - excel/react-excel/test/page/workbook-runtime-provider.test.tsx
  - excel/react-excel/scripts/**
  - excel/react-excel/docs/package/**
  - packages/react-cells/package.json
  - packages/react-cells/vite.config.ts
  - packages/canvas-cells/package.json
  - packages/canvas-cells/vite.config.ts
  - packages/canvas/package.json
  - packages/canvas/vite.config.ts
---

# 外部项目可安装并嵌入完整工作簿

## 目标与交付边界

交付真实可构建、可打包消费的完整React工作簿组件；包含公开入口、Worker装配、JS/声明/CSS/已编译Lingui产物、依赖闭包、就近测试和接入说明。
不改UI Core、Rust或语言/样式隔离，后者由002顺序处理。不得仅删private或导出内部路径冒充完成。

## 上下文

- 当前react-excel是private Vite应用，package.json无main/exports/types，vite.config.ts将Core/cells映射到src；不能拿应用构建当库构建。
- `src/page/WorkbookRuntimeProvider.tsx` 已收 `definition:RustWorkbookDefinition, store?:Store, children`，useEffect调用Core start/dispose；目前固定导入 `@einfach/spreadsheet-ui-core/rust-runtime?worker`。
- Core `startRustWorkbookRuntimeAtom` 已支持 `{definition,workerFactory:()=>WorkerLike}`；不要再造runtime或controller。
- `src/page/WorkbookStoreProvider.tsx` 已注入已有Store/connection；保留受控消费者入口，但该组件本身不初始化文档和原生函数目录，不宣称只传connection即可获得完整初始工作簿。
- `src/workbook/shell/WorkbookView.tsx` 是完整公共视图组合（含chrome和grid），不能以只读cells组件代替。
- `packages/react-cells`、canvas-cells目前private。允许内联这些内部实现到React发布物，或完整交付可发布依赖；优先避免为了首版制造更多公开包。不能external一个无法从registry安装的private依赖。
- 构建需在库侧转换Lingui宏与.po；宿主不应再安装Lingui/Vite宏插件。公开组件只依赖发行版本Core/WASM，不把源码alias发给消费者。

## 覆盖矩阵行

PKG-01、PKG-02、PKG-03。

## 接口

### 消费

- Core现有 `RustWorkbookDefinition`、`WorkerLike`、`startRustWorkbookRuntimeAtom`、`disposeRustWorkbookRuntimeAtom`。
- 当前 `WorkbookView` 与 `WorkbookStoreProvider`。

### 产出（002、004消费）

- 包根 `Spreadsheet`，props至少 `{definition:RustWorkbookDefinition,store?:Store,workerFactory?:()=>WorkerLike,className?:string,style?:CSSProperties}`。
- 包根导出 `WorkbookView`、`WorkbookRuntimeProvider`、`WorkbookStoreProvider` 及组件props类型；精确导出，不把整个Core barrel复制到React包。
- `WorkbookRuntimeProvider` 添加可选 `workerFactory`；未传时使用包内默认模块Worker。公共入口不得保留 `?worker` 依赖。
- 包 `./style.css` 导出库样式；Worker可通过 `new Worker(new URL(...,import.meta.url),{type:'module'})` 或等价标准方式加载，并允许明确工厂覆盖。真实消费者测试由004负责，当前不要声称Rspack已验证。
- 库构建与demo构建分开，scripts `build:lib` 与 `build:demo`，现有 `build` 语义不得悄悄只剩其中一个。声明生成不含test/e2e/page demo。
- 声明支持React18 ESM浏览器；React、react-dom、Einfach Store/React binding以及Core按实际单例身份要求external/peer，避免重复Core atom模块。
- 输出可机械检查的artifact文件列表与后续所需依赖；不得改root package/lockfile/CI，由004统一接入。需要新依赖时在报告列出，由编排者交004更新安装。

## 验收标准

1. 公开入口测试锁定所列运行时导出与类型，导入不创建Worker/不读取demo数据。
2. Provider单测覆盖外部Store、自定义factory、工厂变化/卸载销毁、初始化失败；复用现有生命周期，不双重dispose。
3. `pnpm --filter @einfach/react-excel build:lib` 成功，JS/声明/CSS/Worker产物存在；产物不残留TSX、Lingui宏、.po、workspace源码绝对路径或Vite ?worker。
4. pack检查不包含demo/test/e2e，不要求消费者进行Rust编译；依赖没有无法安装的私有外部包。
5. 现有demo仍可类型检查与构建；不要删任何demo或样例。

## 验证分工

- 执行者：只跑本任务单测、库构建和产物静态检查，各最终源码一次；确有失败修复后重跑对应项。
- 集成004：根构建、真实tarball安装、Vite/Rspack、完整门禁。
- 独立reviewer：复用证据，审入口副作用、共享atom身份、Worker资产与依赖闭包。

## 执行记录

- 2026-10-22：就绪派发；基线08caefbc，与003范围隔离。
- 2026-10-22：收到DONE_WITH_CONCERNS，报告reports/001-report.md；13项运行时测试、修正测试类型后的tsc、最终库构建、12文件pack检查均通过。完整demo和真实消费者按计划交004，CSS/i18n交002；已派独立reviewer，尚未done。
- 2026-10-22：reports/001-review.md独审APPROVED，无Critical/Important；复算27项指纹一致，补验声明和Worker相对引用。旧README的?worker文案Minor交004；本叶done，解锁002。完整包验收仍未完成。
