# 派发前 baseline

原始 HEAD：`f4989f5631044b415920aa706bd8cad2e2c0de96`。下表变更先于任务树，已整体提交为
`fc174dfc feat(react-excel): add standalone workbook demo`；执行者不得回退。任务树获批并提交后，
编排者把届时 HEAD 写入所有叶子的 `base` 再派发。

| pre-commit status | sha256 | path |
|---|---|---|
| M | `aaf866832dae33a59eb564fe7fc0b6deac72bdf758226a4d6fef231d8fafe6d9` | `excel/react-excel/README.md` |
| M | `e437a7d5049f4fc512d217c8286c5c7d7bde729a7421d3ce0f3cd5ab78470cf0` | `excel/react-excel/package.json` |
| M | `43ecb9f13d8966a0943ef691d6f5b4ccc40677547e23f6c6799513b63d83a501` | `pnpm-lock.yaml` |
| M | `de4dffc119896170d14ce22cfe45d84722e7047cd181a3797fa38865e3a79924` | `rules/.eslintrc` |
| ?? | `24972c73330d4a6ebb78b7bd901c48bfa63b964f7a209f3c3ac7ae817bbca26e` | `excel/react-excel/demo/App.tsx` |
| ?? | `e8c3eed2f96b095275d768909d16d1709c99d9e414b54eab49eae1cf38c8bede` | `excel/react-excel/demo/DemoGrid.tsx` |
| ?? | `a912ed2a947a9d59815325805e1f7e082019b4957f8ba296f77f626f129c013d` | `excel/react-excel/demo/FormulaBar.tsx` |
| ?? | `a81e7a9267ccb58fc095d766355132abce1e6c1dd0085949884fb96b4914d5b1` | `excel/react-excel/demo/WorkbookFooter.tsx` |
| ?? | `fed5e9215e1ad7d3893f5d965d3b9fbb1095356ada554ad50a1a16531d118dda` | `excel/react-excel/demo/WorkbookHeader.tsx` |
| ?? | `6310692fc43af7be0135b20ff8e435f7cde7ffd24794f732039cc282d903d635` | `excel/react-excel/demo/WorkbookRibbon.tsx` |
| ?? | `b17be27f0497ac227335cf6a5180373deee65d8e60f490089d586ea520142cd5` | `excel/react-excel/demo/demo-data.ts` |
| ?? | `8ac02e6c2e68b053693d24daa85775b4c66351173cd05e91679bd41ad8b3127b` | `excel/react-excel/demo/formula-bar.css` |
| ?? | `48e637771e81a3ed1c049b28ab991018325b369bc5155bfd5e5b2ca7d2c0fc75` | `excel/react-excel/demo/index.html` |
| ?? | `371c603804497263487a7a854984efcf7ff82ad4c7acd6b15d7617f02da232e0` | `excel/react-excel/demo/main.tsx` |
| ?? | `bde02a4454fe923c7d77273530fe1d181f5d807dedbac2a1a6c43f41dd285dd0` | `excel/react-excel/demo/styles.css` |
| ?? | `e5934de658b5d21d0ef3ce428c97afe93011d5c0cbb7d259c042f529d9bdf101` | `excel/react-excel/demo/tsconfig.json` |
| ?? | `286193430c3da0c30d19f85d1b292b5c4099df7c42933cf4d8ac972c4d1bc6f3` | `excel/react-excel/demo/vite.config.ts` |
| ?? | `3709b4ac0f226466c4f6496189d552deb464101f1fdccd44f7b14e5594ba0689` | `excel/react-excel/demo/workbook-header.css` |
| ?? | `01126fcea949eb1c74eb36fae9c416849dcbf92dcb300f68e3701410c095692` | `excel/react-excel/demo/workbook-ribbon.css` |
| ?? | `183554b367897d5e08c503c8a58ec848deaca7cadeb7b3eeb8c784b241b06dce` | `excel/react-excel/demo/worksheet.css` |

## 重叠串行规则

- `001` 独占 README；任何任务不得触碰 `rules/.eslintrc`。
- `002 → 003 → 011 → 015 → 017 → 018 → 020` 串行拥有 worker/package metadata 与 lock 的变更。
- `016` 只写通用 React runtime；`017` 写默认 Rust bootstrap/dependency；`109`–`111` 串行替换已有 demo data/composition。
- S01 root tasks 全部经 020 后执行，避免 package/config 与 public exports 同 ready-set 冲突。
