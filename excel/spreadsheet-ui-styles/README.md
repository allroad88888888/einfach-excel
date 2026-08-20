# @einfach/spreadsheet-ui-styles

Framework-neutral CSS for Einfach spreadsheet surfaces. This package has no
runtime JavaScript and no framework dependency.

## Use

Load the shared surface layer once for a spreadsheet implementation:

```ts
import '@einfach/spreadsheet-ui-styles/styles.css'
```

Feature styles are exported individually so adapters can preserve their own
lazy-loading lifecycle:

```ts
import '@einfach/spreadsheet-ui-styles/features/find-replace-dialog.css'
```

The selectors describe a DOM contract rather than a component API. Consumers
must render the matching markup and may provide the documented CSS custom
properties from the shared style layer.

## Theming(vnext chrome)

`styles/chrome-tokens.css` 是 vnext 皮肤唯一的取色/尺寸来源(Excel for web
口径)。规则:

- chrome 样式文件里**禁止裸色值** —— 缺 token 就先在 chrome-tokens.css 里加;
- 每个 chrome 面板必须铺**不透明**底色 token,不许透出宿主背景
  (透明拼缝在暗色宿主下会漏光);
- `*-text` 变体是文本安全色(AA ≥4.5:1),同名非 text 色只用于边框/填充。

**暗色皮肤**:宿主在组件任意祖先上放 `data-spreadsheet-theme="dark"` 即
整体换肤(变量继承,零组件配合)。excel-site 的 demo 岛把
`<html data-theme>` 镜像到岛根;solid-excel 的 e2e demo 壳吃 `?theme=dark`。
对齐/对比度的回归门禁在 `excel/solid-excel/e2e/visual-chrome/`。
