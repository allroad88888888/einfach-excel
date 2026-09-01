---
id: "018"
title: 冻结 React E2E infrastructure
kind: leaf
parent: M0
depends_on: ["017"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01h"]
files:
  - excel/react-excel/playwright.config.ts
  - excel/react-excel/e2e/vite.config.ts
  - excel/react-excel/e2e/adapter-selection/react-adapter.spec.ts
  - excel/react-excel/e2e/tsconfig.json
  - excel/react-excel/e2e/fixture/index.html
  - excel/react-excel/demo/index.html
  - excel/react-excel/package.json
  - .tasks/react-excel-univer-parity/reports/018-report.md
---

# 冻结 React E2E infrastructure

## 目标与粒度

只建立三路由 Vite server、四 Playwright projects 与基础 scripts。预计 15–20 分钟；不写 Rust fixture/spec。

## 精确配置

`e2e/vite.config.ts` 的 root 是 react-excel package directory，multi-page inputs 为
`e2e/fixture/index.html`、`e2e/wasm-backend/index.html`（允许尚未存在，dev server可服务）与 `demo/index.html`；alias 指向 UI-core/React source，build manifest=true、outDir=`e2e-dist`。
把两个既有 HTML 的 module script 从 package-root 下会误解析的 `/main.tsx` 改为 `./main.tsx`；该相对写法也兼容 demo 自己以 `demo/` 为 root 的 Vite 配置。
Playwright testDir=`./e2e`；webServer command=`vite --config e2e/vite.config.ts --host 127.0.0.1 --port 5182 --strictPort`，health URL=`/e2e/fixture/`，baseURL root。
projects 精确 chromium/webkit × desktop/390×844；adapter spec 导航 `/e2e/fixture/`。scripts：`test:e2e`、`build:e2e`、`e2e:install` 安装两浏览器；首次 browser gate 前置命令固定为 `pnpm --filter @einfach/react-excel run e2e:install`。

## 验收

- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/adapter-selection/react-adapter.spec.ts --list` 恰发现四 project。
- 同 spec 跑 `chromium-desktop` 通过；`/e2e/fixture/`、`/e2e/fixture/main.tsx`、`/demo/`、`/demo/main.tsx` 均返回 2xx。
- 本叶不运行 `build:e2e`，因为第三个 input 由 task019 生产；task019 创建后必须首次实际 build。
- 配置文件均 ≤300 行。

写 `reports/018-report.md`；不提交。
