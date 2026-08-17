# AD-621 Show HN 标题与正文

> **性质**：发布「弹药」，定稿与发布由维护者执行。发布前用 checklist（showhn-checklist.md）过一遍；标题字符数以发布当刻实数为准。

## 标题备选（均 ≤80 字符，Show HN 惯例：平实描述，无营销词）

1. `Show HN: Einfach Excel – spreadsheet UI core with a Rust/WASM worker engine`（75 字符）
2. `Show HN: A spreadsheet whose UI talks to any backend through three methods`（74 字符）
3. `Show HN: Einfach Excel – MIT spreadsheet: Solid.js UI, Rust/WASM formula engine`（79 字符）

推荐 1：项目名 + 定位一次说清；2 更钩人但少了项目名；3 强调 license 与技术栈，适合重发时换角度。

## 正文（英文，约 210 词）

---

Einfach Excel is an MIT-licensed spreadsheet stack: a framework-agnostic UI core, Solid.js components, and a Rust/WASM formula engine that runs in a Web Worker.

Live demo: https://allroad88888888.github.io/einfach-excel/
Install: `npm install @einfach/solid-excel solid-js`

I built it because embeddable spreadsheets tend to couple the grid to their own data model. Here the UI talks to the workbook only through a backend port, so you can put your own data source behind a real spreadsheet surface.

Three things I find technically interesting:

1. The backend port requires exactly three methods: read the visible projection, read a range projection, set a cell's input. Everything else (undo, filters, comments, protection...) is optional — the UI hides the toolbar buttons, menu entries, and keyboard intents for whatever your backend doesn't implement.

2. Payload follows the viewport, not the workbook. The UI only ever asks for a bounded rectangle, and responses that exceed the requested rectangle are rejected. No per-cell state atoms.

3. Two engines behind one protocol: the Rust/WASM workbook and a TypeScript engine run the same end-to-end suite as a parity gate. The TS engine doubles as a pure-JS deployment path.

Honest boundaries: it's 0.1.0 — minor versions may break (changelogs list removals explicitly), Solid is the only shipped UI binding today, and I make no performance claims; scale behavior is documented as code contracts, not benchmarks.

Happy to answer questions.

---

## 备注

- 若发帖时 React/Vue 适配（AD-300）已发布，改写 "Solid is the only shipped UI binding today" 一句，其余不动。
- 正文不提竞品；评论区被问到再用 checklist E 节的口径答。
