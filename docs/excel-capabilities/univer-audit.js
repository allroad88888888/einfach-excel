// 390 个原待核实条目的静态审计记录；生成数据，不是功能实现代码。
window.UNIVER_AUDIT = {
  "sourceRevision": "d783695403587d44e9c31b70ee60575981ccb8aa",
  "documentationRevision": "c252c2f5ea5772bc055721ca99f2db2673cd19e9",
  "scope": "公开 packages 源码/测试及官方 content 英文 MDX/JSON；排除翻译副本。逐项检索英文标识，再区分直接实现、同名候选和宿主扩展。Pro 闭源未作源码验收。",
  "items": [
    {
      "path": [
        "文件与工作簿",
        "创建与打开",
        "从模板新建"
      ],
      "id": "excel-2",
      "query": "template",
      "matchedFiles": 74,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/menu/desktop/DesignTinyMenuGroup.tsx",
        "packages/ui/src/views/menu/desktop/__tests__/TinyMenuGroup.spec.tsx",
        "packages/ui/src/views/menu/desktop/__tests__/DesignTinyMenuGroup.spec.tsx",
        "packages/ui/src/views/menu/mobile/MobileMenu.tsx",
        "packages/ui/src/services/clipboard/clipboard-interface.service.ts",
        "packages/design/src/components/color-picker/MobileColorPresets.tsx",
        "packages/core/src/shared/date-kit.ts",
        "packages/core/src/docs/data-model/preset-list-type.ts"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "创建与打开",
        "打开云端文件"
      ],
      "id": "excel-4",
      "query": "cloud.*file|remote.*file",
      "matchedFiles": 7,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/services/clipboard/__tests__/clipboard.service.spec.ts",
        "packages/rpc/src/services/remote-instance/remote-instance.service.ts",
        "content/docs/examples/workspace.mdx",
        "content/guides/sheets/features/import-export.mdx",
        "content/guides/bases/features/import-export.mdx",
        "content/guides/docs/features/import-export.mdx",
        "content/reference/facade/univer.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "创建与打开",
        "最近使用文件"
      ],
      "id": "excel-5",
      "query": "recent.*file",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "文件与工作簿",
        "创建与打开",
        "固定常用文件"
      ],
      "id": "excel-6",
      "query": "pin.*file",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/docs.mdx",
        "content/blog/custom-formula.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "创建与打开",
        "打开并修复"
      ],
      "id": "excel-9",
      "query": "repair.*(file|workbook)",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "保存与恢复",
        "自动保存"
      ],
      "id": "excel-14",
      "query": "auto.?save",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/design/src/components/message/Message.stories.tsx",
        "content/docs/features/canvas.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "保存与恢复",
        "自动恢复"
      ],
      "id": "excel-15",
      "query": "auto.?recover",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "文件与工作簿",
        "保存与恢复",
        "恢复未保存工作簿"
      ],
      "id": "excel-16",
      "query": "unsaved",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/object-permission/__tests__/ObjectPermissionButton.spec.tsx",
        "packages/ui/src/services/before-close/__tests__/before-close.service.spec.ts",
        "packages/sheets-note-ui/src/views/__tests__/Note.spec.tsx",
        "content/reference/facade/events.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "保存与恢复",
        "默认保存位置"
      ],
      "id": "excel-19",
      "query": "default.*(save|path)",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/sheets/__tests__/sheet-snapshot-utils.spec.ts",
        "packages/engine-render/src/components/docs/layout/__tests__/tools.spec.ts",
        "packages/sheets-filter/src/models/filter-model.ts",
        "packages/sheets-crosshair-highlight/src/services/crosshair.service.ts",
        "content/blog/find-the-command-id.mdx",
        "content/guides/fundamentals/features/embed.mdx",
        "content/reference/facade/workbook.mdx",
        "content/reference/facade/board.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "XLSB 二进制工作簿"
      ],
      "id": "excel-23",
      "query": "xlsb",
      "matchedFiles": 2,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:162"
      ],
      "note": "官方 Sheets 功能对照表明确列为不支持该格式导入和导出。",
      "candidateFiles": [
        "packages/engine-formula/src/services/unit-reference-resolver.service.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "XLTX 模板"
      ],
      "id": "excel-25",
      "query": "xltx",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/services/unit-reference-resolver.service.ts"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "XLTM 宏模板"
      ],
      "id": "excel-26",
      "query": "xltm",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/services/unit-reference-resolver.service.ts"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "ODS 互操作"
      ],
      "id": "excel-29",
      "query": "opendocument|\\bods\\b",
      "matchedFiles": 3,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:162"
      ],
      "note": "官方 Sheets 功能对照表明确列为不支持该格式导入和导出。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/financial/pl-PL.ts",
        "content/docs/features/sheets.mdx",
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "PDF 导出"
      ],
      "id": "excel-30",
      "query": "export.*pdf|pdf.*export",
      "matchedFiles": 32,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/print.mdx"
      ],
      "note": "Pro 打印可进入浏览器打印对话框，由浏览器另存为 PDF；Sheets 文件导出格式列表未列出原生 PDF 转换 API。",
      "candidateFiles": [
        "packages/sheets-ui/src/views/permission/panel-list/constant.ts",
        "packages/sheets-ui/src/views/permission/user-dialog/constant.ts",
        "packages/protocol/src/index.ts",
        "packages/protocol/src/ts/univer/pdf.ts",
        "packages/engine-formula/src/basics/statistical.ts",
        "content/server/import-export/index.mdx",
        "content/docs/features/slides.mdx",
        "content/docs/features/canvas.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "XPS 导出（Windows）"
      ],
      "id": "excel-31",
      "query": "\\bxps\\b",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "文件与工作簿",
        "文件格式",
        "兼容性检查"
      ],
      "id": "excel-32",
      "query": "compatibility.*check",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/basics/cjk-regexp.ts"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "标题与作者属性"
      ],
      "id": "excel-34",
      "query": "author|document.*title",
      "matchedFiles": 253,
      "state": "partial",
      "sources": [
        "audit/packages/sheets/src/facade/f-workbook.ts:147",
        "audit/packages/core/src/sheets/typedef.ts:92"
      ],
      "note": "有工作簿名称和自定义元数据；未找到与 Office 内置作者、最后修改者等属性对应的标准模型与完整导入导出。",
      "candidateFiles": [
        "packages/find-replace/package.json",
        "packages/drawing-ui/package.json",
        "packages/ui/package.json",
        "packages/sheets-thread-comment-ui/package.json",
        "packages/design/package.json",
        "packages/design/src/index.ts",
        "packages/design/src/components/tooltip/Tooltip.tsx",
        "packages/design/src/components/input/Input.tsx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "自定义属性"
      ],
      "id": "excel-35",
      "query": "custom.*propert",
      "matchedFiles": 72,
      "state": "partial",
      "sources": [
        "audit/packages/sheets/src/facade/f-workbook.ts:1053"
      ],
      "note": "Workbook.getCustomMetadata/setCustomMetadata 可读写自定义 JSON 元数据；未证实与 Excel 自定义文档属性字段及文件往返完全兼容。",
      "candidateFiles": [
        "packages/ui/src/services/menu/menu.ts",
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/commands/mutations/set-row-data.mutation.ts",
        "packages/sheets/src/commands/mutations/set-col-data.mutation.ts",
        "packages/sheets/src/commands/commands/__tests__/set-col-data.command.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/set-range-values.command.spec.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/data-model/__tests__/document-data-model.spec.ts"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "文档检查器"
      ],
      "id": "excel-36",
      "query": "document.*inspect",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/components/docs/layout/__tests__/doc-skeleton.spec.ts",
        "content/docs/features/index.mdx",
        "content/docs/examples/workspace.mdx",
        "content/ai/content-operations.mdx",
        "content/ai/worktree.mdx",
        "content/ai/packages.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "标记为最终状态"
      ],
      "id": "excel-37",
      "query": "mark.*final",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/components/docs/layout/block/paragraph/__tests__/layout-ruler.spec.ts",
        "content/blog/formula.mdx",
        "content/blog/hyphenation.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "密码加密"
      ],
      "id": "excel-38",
      "query": "encrypt|password",
      "matchedFiles": 8,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:151"
      ],
      "note": "官方对照表明确不支持 Office 文件密码解密、密码打开及加密保存；此项不是普通协作权限。",
      "candidateFiles": [
        "packages/engine-formula/src/functions/text/regexmatch/__tests__/index.spec.ts",
        "packages/engine-formula/src/engine/utils/__tests__/regexp-check.spec.ts",
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/canvas.mdx",
        "content/docs/features/pdf.mdx",
        "content/docs/features/docs.mdx",
        "content/docs/features/relational-table.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "数字签名"
      ],
      "id": "excel-39",
      "query": "digital.*sign",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx",
        "content/docs/features/docs.mdx",
        "content/blog/di.mdx"
      ]
    },
    {
      "path": [
        "文件与工作簿",
        "文件属性",
        "文件共享入口"
      ],
      "id": "excel-40",
      "query": "share.*file",
      "matchedFiles": 27,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该文件管理/格式能力的直接实现。快照与文件存储扩展点不等于已经提供该功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/facade/permission/f-workbook-permission.ts",
        "content/server/index.mdx",
        "content/server/collaboration/packages.mdx",
        "content/docs/get-started.mdx",
        "content/docs/index.mdx",
        "content/docs/features/index.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/shared/meta.ko-KR.json"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "工作表管理",
        "跨工作簿移动与复制"
      ],
      "id": "excel-48",
      "query": "cross.*(workbook|unit)|targetUnitId",
      "matchedFiles": 52,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts",
        "packages/ui/src/views/notification/Notification.stories.tsx",
        "packages/ui/src/services/layout/layout.service.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-copy-paste.controller.ts",
        "packages/sheets/src/locale/it-IT.ts",
        "packages/sheets/src/models/range-theme-model.ts",
        "packages/sheets/src/models/__tests__/range-theme-model.spec.ts",
        "packages/sheets/src/controllers/zebar-crossing.controller.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "工作表管理",
        "工作表分组"
      ],
      "id": "excel-51",
      "query": "group.*(sheet|worksheet)",
      "matchedFiles": 53,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/commands/operations/__tests__/drawing-arrange-group.operation.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/utils.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/drawing-update.controller.spec.ts",
        "packages/drawing/src/utils/__tests__/drawing-copy-plan.spec.ts",
        "packages/sheets-numfmt-ui/src/menu/numfmt-menu-util.ts",
        "packages/sheets-drawing/src/facade/f-worksheet.ts",
        "packages/sheets-drawing/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/sheets-drawing/src/commands/commands/__tests__/sheet-drawing.integration.spec.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "工作表管理",
        "取消工作表分组"
      ],
      "id": "excel-52",
      "query": "ungroup.*(sheet|worksheet)",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/commands/operations/__tests__/drawing-arrange-group.operation.spec.ts",
        "packages/sheets-drawing/src/facade/f-worksheet.ts",
        "packages/sheets-drawing-ui/src/index.ts",
        "packages/sheets-drawing-ui/src/commands/commands/ungroup-sheet-drawing.command.ts",
        "packages/sheets-drawing-ui/src/commands/commands/__tests__/utils.spec.ts",
        "packages/sheets-drawing-ui/src/commands/commands/__tests__/drawing-commands.spec.ts",
        "packages/sheets-drawing-ui/src/controllers/ui.controller.ts",
        "packages/sheets-drawing-ui/src/controllers/sheet-drawing-update.controller.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "行列操作",
        "默认行高列宽"
      ],
      "id": "excel-65",
      "query": "defaultRowHeight|defaultColumnWidth",
      "matchedFiles": 46,
      "state": "oss",
      "sources": [
        "audit/packages/core/src/sheets/typedef.ts:149"
      ],
      "note": "IWorksheetData 提供 defaultRowHeight/defaultColumnWidth；作为工作表配置，不含 Office 选项对话框。",
      "candidateFiles": [
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/commands/mutations/set-worksheet-row-height.mutation.ts",
        "packages/sheets/src/commands/mutations/__tests__/create-command-test-bed.ts",
        "packages/sheets/src/commands/mutations/__tests__/worksheet-meta.mutation.spec.ts",
        "packages/sheets/src/commands/commands/set-row-visible.command.ts",
        "packages/sheets/src/commands/commands/insert-row-col.command.ts",
        "packages/sheets/src/commands/commands/set-col-visible.command.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "单元格结构",
        "跨列居中"
      ],
      "id": "excel-73",
      "query": "center.*across",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "工作表与网格结构",
        "容量与坐标",
        "行列标题"
      ],
      "id": "excel-77",
      "query": "rowHeader|columnHeader",
      "matchedFiles": 134,
      "state": "oss",
      "sources": [
        "audit/packages/core/src/sheets/typedef.ts:165",
        "audit/packages/engine-render/src/components/sheets/sheet.render-skeleton.ts"
      ],
      "note": "工作表模型提供 rowHeader/columnHeader 尺寸及 hidden，渲染器读取标题配置。",
      "candidateFiles": [
        "packages/ui/src/services/menu/types.ts",
        "packages/sheets-drawing/src/basics/transform-position.ts",
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts",
        "packages/sheets/src/basics/selection.ts",
        "packages/sheets/src/basics/sheet-header.ts",
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/models/range-themes/build-in-theme.factory.ts",
        "packages/sheets/src/commands/mutations/__tests__/create-command-test-bed.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "容量与坐标",
        "单表 1,048,576 行 × 16,384 列"
      ],
      "id": "excel-79",
      "query": "1048576|16384",
      "matchedFiles": 7,
      "state": "partial",
      "sources": [
        "audit/packages/core/src/shared/max-row-column.ts:37"
      ],
      "note": "公式和坐标边界常量为 1,048,576×16,384。模型行列数可配置；没有据此证明浏览器可满载 Excel 最大容量或同等性能。",
      "candidateFiles": [
        "packages/core/src/shared/max-row-column.ts",
        "packages/core/src/shared/__tests__/drawing-and-sheet-utils.spec.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ar-SA.ts",
        "packages/engine-formula/src/functions/engineering/convert/index.ts",
        "packages/engine-formula/src/engine/analysis/__tests__/lexer.spec.ts",
        "packages/engine-formula/src/engine/utils/reference.ts",
        "packages/engine-formula/src/engine/utils/__tests__/reference.spec.ts"
      ]
    },
    {
      "path": [
        "工作表与网格结构",
        "容量与坐标",
        "工作簿内存与格式数量限制"
      ],
      "id": "excel-80",
      "query": "memory.*limit|style.*limit",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-table-ui/src/views/components/__tests__/SheetTableFilterPanel.spec.tsx",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-render/src/basics/i-document-skeleton-cached.ts",
        "packages/engine-render/src/components/docs/layout/block/paragraph/__tests__/layout-ruler.spec.ts",
        "content/server/import-export/index.mdx"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "选择",
        "仅选择可见单元格"
      ],
      "id": "excel-90",
      "query": "visible.*(cell|range)",
      "matchedFiles": 78,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "packages/drawing-ui/src/views/object-list-panel/MobileObjectListPanel.tsx",
        "packages/sheets-drawing/src/services/sheet-drawing-placement.ts",
        "packages/sheets/src/index.ts",
        "packages/sheets/src/basics/utils.ts",
        "packages/sheets/src/basics/__tests__/utils.spec.ts",
        "packages/sheets/src/locale/fr-FR.ts",
        "packages/sheets/src/models/range-theme-model.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "选择",
        "选择当前数组"
      ],
      "id": "excel-92",
      "query": "current.*array|select.*array",
      "matchedFiles": 68,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/object-list-panel/__tests__/ObjectListPanelBase.spec.tsx",
        "packages/drawing-ui/src/views/__tests__/DrawingPanelActions.spec.tsx",
        "packages/ui/src/common/__tests__/menu-hidden-observable.spec.ts",
        "packages/ui/src/views/components/context-menu/__tests__/AnchoredContextMenu.spec.tsx",
        "packages/ui/src/services/menu/menu.ts",
        "packages/sheets-thread-comment-ui/src/views/__tests__/SheetsThreadCommentPanel.spec.tsx",
        "packages/design/src/components/select/MobileSelect.tsx",
        "packages/sheets-sort-ui/src/locale/en-US.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "导航定位",
        "定位对话框"
      ],
      "id": "excel-95",
      "query": "go.?to.*dialog",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "选区、导航与输入",
        "导航定位",
        "定位条件"
      ],
      "id": "excel-96",
      "query": "go.?to.*special",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "选区、导航与输入",
        "数据输入",
        "多单元格同时输入"
      ],
      "id": "excel-113",
      "query": "ctrl.*enter|control.*enter",
      "matchedFiles": 21,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-ui/src/controllers/editor/editing.render-controller.ts:786"
      ],
      "note": "Ctrl+Enter 提交时传入 wholeSelection=true，编辑内容应用于选区；不是批量调用 API 的推断。",
      "candidateFiles": [
        "packages/ui/src/services/shortcut/shortcut.service.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-permission.controller.ts",
        "packages/sheets-ui/src/controllers/ui.controller.ts",
        "packages/sheets-ui/src/controllers/cell-popup-editor.controller.ts",
        "packages/sheets-ui/src/controllers/shortcuts/editor.shortcut.ts",
        "packages/sheets-ui/src/controllers/editor/editing.render-controller.ts",
        "packages/sheets-ui/src/controllers/editor/__tests__/editing.render-controller.spec.ts",
        "packages/sheets-ui/src/services/selection/selection-shape-extension.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "数据输入",
        "下拉记忆输入"
      ],
      "id": "excel-114",
      "query": "auto.?complete",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "选区、导航与输入",
        "数据输入",
        "输入法与区域格式"
      ],
      "id": "excel-115",
      "query": "composition|locale",
      "matchedFiles": 2296,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-ui/src/controllers/editor/editing.render-controller.ts",
        "audit/content/guides/sheets/features/core/numfmt.mdx"
      ],
      "note": "有输入组合事件处理及多地区数字/日期格式；未验收全部输入法，也不等同于 Excel 系统区域设置面板。",
      "candidateFiles": [
        "packages/find-replace/package.json",
        "packages/find-replace/src/locale/zh-TW.ts",
        "packages/find-replace/src/locale/pt-BR.ts",
        "packages/find-replace/src/locale/fa-IR.ts",
        "packages/find-replace/src/locale/fr-FR.ts",
        "packages/find-replace/src/locale/ca-ES.ts",
        "packages/find-replace/src/locale/zh-CN.ts",
        "packages/find-replace/src/locale/ko-KR.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "数据类型",
        "长数字与有效精度"
      ],
      "id": "excel-120",
      "query": "precision|significant",
      "matchedFiles": 145,
      "state": "partial",
      "sources": [
        "audit/packages/core/src/shared/numfmt/general.ts",
        "audit/packages/sheets-numfmt-ui/src/controllers/numfmt.editor.controller.ts"
      ],
      "note": "数字格式实现考虑 Excel 15 位有效数字及文本输入；没有完成全部超长整数、序列化和计算精度的 Excel 兼容验收。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/image-cropper.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/image-cropper.controller.ts",
        "packages/drawing-ui/src/views/panel/DrawingTransform.tsx",
        "packages/drawing-ui/src/views/panel/MobileDrawingControls.tsx",
        "packages/design/src/components/input-number/InputNumber.stories.tsx",
        "packages/design/src/components/input-number/InputNumber.tsx",
        "packages/design/src/components/input-number/__tests__/InputNumber.spec.tsx",
        "packages/sheets-numfmt-ui/src/utils/temporal-editor-value.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "数据类型",
        "1900 与 1904 日期系统"
      ],
      "id": "excel-122",
      "query": "date1904|dateSystem",
      "matchedFiles": 190,
      "state": "oss",
      "sources": [
        "audit/packages/core/src/sheets/typedef.ts:60",
        "audit/packages/engine-formula/src/engine/ast-node/__tests__/function-node.spec.ts:113"
      ],
      "note": "Workbook.dateSystem 与日期序列转换支持 1900/1904；测试覆盖两个工作簿采用不同日期系统的隐式转换。",
      "candidateFiles": [
        "packages/sheets-numfmt-ui/src/utils/temporal-editor-value.ts",
        "packages/sheets-numfmt-ui/src/utils/__tests__/temporal-editor-value.spec.ts",
        "packages/sheets-numfmt-ui/src/controllers/numfmt.editor.controller.ts",
        "packages/sheets/src/commands/commands/text-to-number.command.ts",
        "packages/sheets/src/commands/commands/__tests__/simple-command-handlers.spec.ts",
        "packages/core/src/types/enum/date-system.ts",
        "packages/core/src/sheets/empty-snapshot.ts",
        "packages/core/src/sheets/typedef.ts"
      ]
    },
    {
      "path": [
        "选区、导航与输入",
        "数据类型",
        "超链接自动识别"
      ],
      "id": "excel-123",
      "query": "auto.*hyper.?link|url.*detect",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-hyper-link-ui/src/controllers/__tests__/auto-fill.controller.spec.ts",
        "content/guides/pdfs/features/core/editing.mdx",
        "content/reference/packages/plugins/univerjs/docs-ui.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "编辑操作",
        "拖动复制"
      ],
      "id": "excel-133",
      "query": "drag.*copy|copy.*drag",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/basics/selection.ts",
        "packages/engine-formula/src/basics/common.ts",
        "content/blog/anatomy.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "编辑操作",
        "清除超链接"
      ],
      "id": "excel-136",
      "query": "cancelHyperLink",
      "matchedFiles": 13,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-hyper-link/src/facade/f-range.ts:240"
      ],
      "note": "FRange.cancelHyperLink 可移除单元格或范围中的超链接。",
      "candidateFiles": [
        "packages/sheets-hyper-link/src/index.ts",
        "packages/sheets-hyper-link/src/facade/f-range.ts",
        "packages/sheets-hyper-link/src/facade/f-univer.ts",
        "packages/sheets-hyper-link/src/facade/__tests__/f-range.spec.ts",
        "packages/sheets-hyper-link/src/commands/commands/remove-hyper-link.command.ts",
        "packages/sheets-hyper-link/src/commands/commands/__tests__/hyper-link.command.spec.ts",
        "packages/sheets-hyper-link/src/controllers/sheet-hyper-link.controller.ts",
        "packages/sheets-hyper-link-ui/src/views/MobileCellLinkPopup.tsx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴批注与备注"
      ],
      "id": "excel-142",
      "query": "paste.*(comment|note)",
      "matchedFiles": 5,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-copy-paste.controller.ts"
      ],
      "note": "已找到线程评论剪切后粘贴的移动处理；未确认复制全部评论、备注及“仅批注备注”的独立粘贴入口。",
      "candidateFiles": [
        "packages/sheets-thread-comment-ui/src/mobile-plugin.ts",
        "packages/sheets-thread-comment-ui/src/plugin.ts",
        "packages/sheets-thread-comment-ui/src/controllers/__tests__/sheets-thread-comment-copy-paste.controller.spec.ts",
        "packages/docs-ui/src/commands/commands/clipboard.inner.command.ts",
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard-paste-from-notepad.spec.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴数据验证"
      ],
      "id": "excel-143",
      "query": "paste.*validation",
      "matchedFiles": 3,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-data-validation-ui/src/controllers/dv-copy-paste.controller.ts"
      ],
      "note": "有随范围复制粘贴验证规则的 hook；未找到 Excel“仅粘贴数据验证”的独立选择性粘贴入口。",
      "candidateFiles": [
        "packages/core/src/types/enum/copy-paste-type.ts",
        "packages/sheets-data-validation-ui/src/controllers/dv-copy-paste.controller.ts",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴数值与数字格式"
      ],
      "id": "excel-145",
      "query": "paste.*(number|numfmt)",
      "matchedFiles": 4,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-ui/src/services/clipboard/clipboard.service.ts",
        "audit/packages/sheets-formula-ui/src/controllers/formula-clipboard.controller.ts"
      ],
      "note": "可粘贴值并通过插件处理数字格式；未确认“数值和数字格式”这一独立组合选项与 Excel 等价。",
      "candidateFiles": [
        "packages/docs-ui/src/commands/commands/__tests__/clipboard.inner.command.spec.ts",
        "packages/sheets-ui/src/locale/en-US.ts",
        "packages/sheets-ui/src/controllers/clipboard/utils.ts",
        "content/blog/custom-command.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "保留源格式"
      ],
      "id": "excel-146",
      "query": "SPECIAL_PASTE_FORMAT",
      "matchedFiles": 12,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-ui/src/services/clipboard/clipboard.service.ts:962"
      ],
      "note": "普通范围粘贴携带源单元格内容与样式，条件格式、验证及数字格式由对应插件接入。",
      "candidateFiles": [
        "packages/sheets-conditional-formatting-ui/src/controllers/cf.copy-paste.controller.ts",
        "packages/sheets-data-validation-ui/src/controllers/dv-copy-paste.controller.ts",
        "packages/sheets-ui/src/commands/commands/clipboard.command.ts",
        "packages/sheets-ui/src/commands/commands/__tests__/confirm-and-clipboard.command.spec.ts",
        "packages/sheets-ui/src/controllers/clipboard/clipboard.controller.ts",
        "packages/sheets-ui/src/views/clipboard/ClipboardPopupMenu.tsx",
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts",
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard-state.service.spec.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "匹配目标格式"
      ],
      "id": "excel-147",
      "query": "destination.*format|target.*format",
      "matchedFiles": 32,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/index.ts",
        "packages/ui/src/controllers/format-painter.controller.ts",
        "packages/ui/src/services/format-painter/format-painter-canvas.ts",
        "packages/ui/src/services/format-painter/format-painter-session.service.ts",
        "packages/sheets/src/controllers/__tests__/auto-fill.controller.spec.ts",
        "packages/docs-ui/src/locale/pt-BR.ts",
        "packages/docs-ui/src/locale/ca-ES.ts",
        "packages/docs-ui/src/locale/it-IT.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "跳过空单元格"
      ],
      "id": "excel-148",
      "query": "skip.*blank",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/functions/__tests__/nested-functions.spec.ts",
        "packages/engine-formula/src/engine/value-object/array-value-object.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "转置粘贴"
      ],
      "id": "excel-149",
      "query": "transpose.*past",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/packages/sheets-ui/src/services/clipboard/clipboard.service.ts:882"
      ],
      "note": "剪贴板服务的转置处理步骤明确标注 TODO: not implemented yet；此结论针对所核对的开源剪贴板路径。",
      "candidateFiles": [
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴加减乘除"
      ],
      "id": "excel-150",
      "query": "paste.*(multiply|subtract|add|divide)",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/services/clipboard/html-to-udm/converter.ts",
        "packages/sheets-data-validation-ui/src/controllers/dv-copy-paste.controller.ts",
        "packages/sheets-ui/src/services/clipboard/html-to-usm/converter.ts",
        "packages/sheets-drawing-ui/src/controllers/__tests__/sheet-drawing-copy-paste.controller.spec.ts",
        "content/blog/custom-command.mdx",
        "content/guides/pdfs/features/core/index.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴链接"
      ],
      "id": "excel-151",
      "query": "paste.*link",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-hyper-link-ui/src/controllers/__tests__/copy-paste.controller.spec.ts",
        "content/guides/docs/features/core/index.mdx",
        "content/reference/packages/plugins/univerjs/docs-ui.mdx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "粘贴图片"
      ],
      "id": "excel-152",
      "query": "paste.*image",
      "matchedFiles": 21,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-drawing-ui/src/controllers/sheet-drawing-copy-paste.controller.ts:209"
      ],
      "note": "剪贴板 onPasteFiles 筛选 image MIME 并调用 InsertFloatImageCommand；需配置图片存储服务及浏览器剪贴板权限。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/doc-clipboard.controller.spec.ts",
        "packages/docs-ui/src/services/clipboard/clipboard.service.ts",
        "packages/docs-ui/src/services/clipboard/__tests__/clipboard.service.spec.ts",
        "packages/docs-ui/src/services/clipboard/__tests__/html-and-udm-convert.spec.ts",
        "packages/sheets-ui/src/facade/__tests__/f-univer.spec.ts",
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "选择性粘贴",
        "链接的图片"
      ],
      "id": "excel-153",
      "query": "linked.*image",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "编辑与剪贴板",
        "查找与替换",
        "通配符查找"
      ],
      "id": "excel-161",
      "query": "wildcard|wild.?card",
      "matchedFiles": 28,
      "state": "unsupported",
      "sources": [
        "audit/packages/sheets-find-replace/src/controllers/sheet-find-replace.controller.ts:1141"
      ],
      "note": "当前查找匹配器使用字符串全等或 indexOf，替换使用转义后的字面正则；未实现 Excel *、? 通配符查找语义。",
      "candidateFiles": [
        "packages/core/src/common/regexp/index.ts",
        "packages/core/src/common/regexp/escape.ts",
        "packages/core/src/common/__tests__/regexp.spec.ts",
        "packages/sheets-table/src/models/filter-util/text-filter-util.ts",
        "packages/sheets-table/src/models/filter-util/__tests__/filter-util.spec.ts",
        "packages/engine-formula/src/locale/function-list/lookup/id-ID.ts",
        "packages/engine-formula/src/locale/function-list/lookup/en-US.ts",
        "packages/engine-formula/src/locale/function-list/math/id-ID.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "查找与替换",
        "按行或按列搜索"
      ],
      "id": "excel-162",
      "query": "findDirection",
      "matchedFiles": 15,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-find-replace/src/controllers/sheet-find-replace.controller.ts:446"
      ],
      "note": "FindDirection 控制遍历及结果排序，具备按行/按列查找。",
      "candidateFiles": [
        "packages/find-replace/src/index.ts",
        "packages/find-replace/src/commands/operations/__tests__/find-replace.operation.spec.ts",
        "packages/find-replace/src/views/dialog/FindReplaceDialog.tsx",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceSettings.tsx",
        "packages/find-replace/src/services/find-replace.service.ts",
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts",
        "packages/docs-find-replace/src/models/__tests__/docs-find.model.spec.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "查找与替换",
        "按格式查找替换"
      ],
      "id": "excel-164",
      "query": "find.*format|format.*find",
      "matchedFiles": 22,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/feature-search/__tests__/FeatureSearch.spec.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/ToolbarItem.spec.tsx",
        "packages/core/src/shared/numfmt/locale.ts",
        "packages/core/src/shared/numfmt/api.ts",
        "packages/docs-ui/src/services/doc-auto-format.service.ts",
        "packages/sheets-conditional-formatting-ui/src/controllers/__tests__/cf.copy-paste.controller.spec.ts",
        "packages/sheets-ui/src/views/mobile/action-panel/MobileStylePanel.tsx",
        "packages/sheets-ui/src/views/mobile/action-panel/__tests__/MobileStylePanel.spec.tsx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "查找与替换",
        "跨工作表搜索"
      ],
      "id": "excel-165",
      "query": "FindScope.*WORKBOOK|isSheetHidden",
      "matchedFiles": 18,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-find-replace/src/controllers/sheet-find-replace.controller.ts:261"
      ],
      "note": "工作簿范围可搜索多工作表，但源码明确排除隐藏工作表；不按 Excel 完整范围语义计为完全支持。",
      "candidateFiles": [
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/facade/__tests__/f-univer.spec.ts",
        "packages/sheets/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/set-worksheet-hide.command.spec.ts",
        "packages/core/src/sheets/worksheet.ts",
        "packages/core/src/sheets/workbook.ts",
        "packages/core/src/sheets/__tests__/worksheet-range.integration.spec.ts",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/SheetBarTabs.tsx"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "向上与向左填充"
      ],
      "id": "excel-169",
      "query": "Direction.LEFT|Direction.UP",
      "matchedFiles": 65,
      "state": "oss",
      "sources": [
        "audit/packages/sheets/src/services/auto-fill/rules.ts:77"
      ],
      "note": "自动填充规则显式处理 Direction.LEFT/UP，并逆序生成与回写数字及日期序列。",
      "candidateFiles": [
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts",
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/commands/commands/insert-row-col.command.ts",
        "packages/sheets/src/controllers/auto-fill.controller.ts",
        "packages/sheets/src/controllers/permission/sheet-permission-check.controller.ts",
        "packages/sheets/src/services/auto-fill/auto-fill.service.ts",
        "packages/sheets/src/services/auto-fill/rules.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "等比序列"
      ],
      "id": "excel-172",
      "query": "geometric|growth.*series",
      "matchedFiles": 14,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/basics/statistical.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/sk-SK.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/en-US.ts",
        "packages/engine-formula/src/locale/function-list/statistical/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/statistical/sk-SK.ts",
        "packages/engine-formula/src/locale/function-list/statistical/en-US.ts",
        "packages/engine-formula/src/functions/compatibility/hypgeomdist/index.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "工作日序列"
      ],
      "id": "excel-174",
      "query": "workday.*fill|fill.*workday",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "自定义序列"
      ],
      "id": "excel-175",
      "query": "custom.*series",
      "matchedFiles": 2,
      "state": "partial",
      "sources": [
        "audit/packages/sheets/src/services/auto-fill/auto-fill.service.ts",
        "audit/packages/sheets/src/controllers/auto-fill.controller.ts"
      ],
      "note": "可由插件注册自定义自动填充规则；未见 Excel 用户自定义序列管理对话框或直接内置同等管理流程。",
      "candidateFiles": [
        "packages/sheets/src/controllers/auto-fill.controller.ts",
        "packages/sheets-ui/src/services/__tests__/repeat-last-action.service.spec.ts"
      ]
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "趋势填充"
      ],
      "id": "excel-176",
      "query": "trend.*fill|fill.*trend",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "快速填充 Flash Fill"
      ],
      "id": "excel-177",
      "query": "flash.?fill",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "编辑与剪贴板",
        "填充",
        "跨工作表填充"
      ],
      "id": "excel-178",
      "query": "fill.*(sheet|worksheet)",
      "matchedFiles": 39,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/commands/commands/auto-fill.command.ts",
        "packages/sheets/src/commands/commands/__tests__/auto-fill.command.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/simple-command-handlers.spec.ts",
        "packages/sheets/src/controllers/basic-worksheet.controller.ts",
        "packages/sheets/src/services/auto-fill/auto-fill.service.ts",
        "packages/core/src/sheets/sheet-skeleton.ts",
        "packages/sheets-table/src/commands/utils/__tests__/calculated-column.spec.ts"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "字体",
        "主题字体"
      ],
      "id": "excel-188",
      "query": "theme.*font|majorFont|minorFont",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/basics/__tests__/tools.spec.ts",
        "content/server/architecture.mdx",
        "content/server/deployment.mdx",
        "content/docs/get-started.mdx",
        "content/docs/features/slides.mdx",
        "content/guides/boards/ui/fonts.mdx"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "对齐",
        "竖排文字"
      ],
      "id": "excel-196",
      "query": "VERTICAL_ROTATE_ANGLE|vertical.*text",
      "matchedFiles": 55,
      "state": "oss",
      "sources": [
        "audit/packages/engine-render/src/basics/text-rotation.ts",
        "audit/packages/engine-render/src/components/sheets/extensions/font.ts"
      ],
      "note": "文本旋转模型 tr.v 区分竖排与角度旋转，渲染器有竖排处理。",
      "candidateFiles": [
        "packages/ui/src/utils/cell.ts",
        "packages/ui/src/utils/__tests__/cell.spec.ts",
        "packages/sheets/src/index.ts",
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/facade/__tests__/f-range.spec.ts",
        "packages/sheets/src/facade/__tests__/f-workbook.spec.ts",
        "packages/sheets/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/sheets/src/commands/commands/set-border.command.ts"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "对齐",
        "阅读顺序"
      ],
      "id": "excel-197",
      "query": "TextDirection|readingOrder",
      "matchedFiles": 34,
      "state": "partial",
      "sources": [
        "audit/packages/core/src/types/enum/text-style.ts",
        "audit/packages/engine-render/src/components/sheets/util.ts"
      ],
      "note": "模型支持 LEFT_TO_RIGHT/RIGHT_TO_LEFT 并传入文本渲染；未确认 Excel“上下文”阅读顺序选项的完整界面与双向文字兼容。",
      "candidateFiles": [
        "packages/core/src/types/enum/text-style.ts",
        "packages/core/src/types/const/const.ts",
        "packages/core/src/types/interfaces/i-style-data.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/sheets/worksheet.ts",
        "packages/core/src/sheets/range.ts",
        "packages/core/src/sheets/util.ts",
        "packages/core/src/sheets/__tests__/util.spec.ts"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "数字格式",
        "特殊格式"
      ],
      "id": "excel-209",
      "query": "special.*format|zip.*code|postal",
      "matchedFiles": 20,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-numfmt-ui/src/locale/en-US.ts",
        "packages/sheets-conditional-formatting-ui/src/commands/operations/__tests__/open-conditional-formatting-panel.spec.ts",
        "packages/sheets-conditional-formatting-ui/src/controllers/cf.copy-paste.controller.ts",
        "packages/sheets-data-validation-ui/src/controllers/dv-copy-paste.controller.ts",
        "packages/sheets-ui/src/commands/commands/clipboard.command.ts",
        "packages/sheets-ui/src/commands/commands/__tests__/confirm-and-clipboard.command.spec.ts",
        "packages/sheets-ui/src/controllers/clipboard/clipboard.controller.ts",
        "packages/sheets-ui/src/views/clipboard/ClipboardPopupMenu.tsx"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "外观与复用",
        "图案填充"
      ],
      "id": "excel-217",
      "query": "pattern.*fill",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/components/docs/extensions/font-and-base-line.ts",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "外观与复用",
        "工作簿主题"
      ],
      "id": "excel-225",
      "query": "workbook.*theme",
      "matchedFiles": 5,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/shared/themes-and-locales.mdx"
      ],
      "note": "编辑器主题与 Range/Table 内容主题有实现，但官方明确应用主题不重写已存单元格/形状/图表颜色；未确认 Excel 工作簿 theme.xml 色彩/字体/效果体系完整兼容。",
      "candidateFiles": [
        "packages/sheets/src/facade/f-workbook.ts",
        "packages/sheets/src/facade/__tests__/f-workbook.spec.ts",
        "packages/sheets/src/commands/mutations/__tests__/worksheet-protection-and-theme.mutation.spec.ts",
        "content/guides/sheets/features/core/range-theme.mdx",
        "content/reference/facade/workbook.mdx"
      ]
    },
    {
      "path": [
        "单元格格式与样式",
        "外观与复用",
        "主题颜色与效果"
      ],
      "id": "excel-226",
      "query": "theme.*color",
      "matchedFiles": 114,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/shared/themes-and-locales.mdx"
      ],
      "note": "编辑器主题与 Range/Table 内容主题有实现，但官方明确应用主题不重写已存单元格/形状/图表颜色；未确认 Excel 工作簿 theme.xml 色彩/字体/效果体系完整兼容。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/image-preview/mobile-image-preview-button.ts",
        "packages/ui/src/services/theme-switcher/__tests__/theme-switcher.service.spec.ts",
        "packages/sheets-thread-comment-ui/src/controllers/render-controllers/drawing.render-controller.ts",
        "packages/docs-find-replace/src/models/docs-find.model.ts",
        "packages/sheets-numfmt-ui/src/controllers/ui.controller.ts",
        "packages/sheets/src/basics/cell-style.ts",
        "packages/sheets/src/models/range-themes/build-in-theme.factory.ts",
        "packages/core/src/types/enum/theme-color-type.ts"
      ]
    },
    {
      "path": [
        "条件格式",
        "规则类型",
        "空白与错误值规则"
      ],
      "id": "excel-237",
      "query": "ISBLANK|ISERROR",
      "matchedFiles": 548,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-conditional-formatting/src/models/calculate-unit-v2/highlight-cell-calculate-unit.ts:282",
        "audit/packages/sheets-conditional-formatting/src/base/const.ts"
      ],
      "note": "规则执行器直接实现 containsBlanks/notContainsBlanks/containsErrors/notContainsErrors；不只是用自定义公式替代。",
      "candidateFiles": [
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/facade/__tests__/f-range.spec.ts",
        "packages/sheets/src/controllers/__tests__/formula/array-inverted-index-cache7.spec.ts",
        "packages/core/src/shared/tools.ts",
        "packages/core/src/shared/numfmt/format-info.ts",
        "packages/core/src/shared/__tests__/tools.spec.ts",
        "packages/sheets-data-validation/src/commands/commands/data-validation.command.ts",
        "packages/sheets-data-validation/src/validators/list-validator.ts"
      ]
    },
    {
      "path": [
        "条件格式",
        "可视化规则",
        "负值数据条"
      ],
      "id": "excel-244",
      "query": "nativeColor|negative.*bar",
      "matchedFiles": 16,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-conditional-formatting/src/facade/f-conditional-formatting-builder.ts:1113",
        "audit/packages/sheets-conditional-formatting/src/render/__tests__/conditional-formatting-render.spec.ts"
      ],
      "note": "nativeColor 对应负值颜色，计算/绘制与测试覆盖正负数据条。",
      "candidateFiles": [
        "packages/sheets-conditional-formatting-ui/src/utils/__tests__/get-rule-describe.spec.ts",
        "packages/sheets-conditional-formatting-ui/src/menu/quick-insert.menu.ts",
        "packages/sheets-conditional-formatting-ui/src/commands/commands/add-data-bar-cf.command.ts",
        "packages/sheets-conditional-formatting-ui/src/commands/commands/__tests__/add-conditional-formatting.command.spec.ts",
        "packages/sheets-conditional-formatting-ui/src/views/ConditionalFormattingRulePreview.tsx",
        "packages/sheets-conditional-formatting-ui/src/views/panel/rule-edit/DataBar.tsx",
        "packages/sheets-conditional-formatting-ui/src/views/panel/rule-edit/__tests__/RuleEditors.spec.tsx",
        "packages/sheets-conditional-formatting-ui/src/views/__tests__/ConditionalFormattingRulePreview.spec.tsx"
      ]
    },
    {
      "path": [
        "条件格式",
        "规则管理",
        "复制条件格式"
      ],
      "id": "excel-254",
      "query": "clipboard|copy.*conditional",
      "matchedFiles": 233,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-conditional-formatting-ui/src/controllers/cf.copy-paste.controller.ts"
      ],
      "note": "条件格式插件注册复制粘贴 hook，将规则范围映射到目标位置。",
      "candidateFiles": [
        "packages/drawing-ui/src/index.ts",
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/ui/src/mobile-plugin.ts",
        "packages/ui/src/plugin.ts",
        "packages/ui/src/index.ts",
        "packages/ui/src/locale/zh-TW.ts",
        "packages/ui/src/locale/pt-BR.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式语法",
        "隐式交叉 @"
      ],
      "id": "excel-264",
      "query": "implicit.*intersect|PREFIX_AT|@.*operator",
      "matchedFiles": 19,
      "state": "oss",
      "sources": [
        "audit/packages/engine-formula/src/engine/ast-node/prefix-node.ts:118"
      ],
      "note": "PrefixNode 实现 @ 按当前行/列投影引用、表引用及不满足交叉时返回 #VALUE!。",
      "candidateFiles": [
        "packages/sheets-data-validation/src/facade/f-data-validation-builder.ts",
        "packages/sheets-data-validation/src/facade/f-data-validation.ts",
        "packages/sheets-conditional-formatting/src/facade/f-conditional-formatting-builder.ts",
        "packages/engine-formula/src/models/__tests__/formula-data.model.spec.ts",
        "packages/engine-formula/src/functions/lookup/xlookup/__tests__/index.spec.ts",
        "packages/engine-formula/src/functions/math/sumproduct/__tests__/index.spec.ts",
        "packages/engine-formula/src/functions/math/randarray/__tests__/index.spec.ts",
        "packages/engine-formula/src/functions/__tests__/nested-functions.spec.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "名称管理",
        "从选区创建名称"
      ],
      "id": "excel-281",
      "query": "create.*name.*selection|name.*selection",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/design/src/components/calendar/Calendar.tsx",
        "packages/sheets/src/services/selections/selection-data-model.ts",
        "packages/core/src/docs/data-model/text-x/text-x.ts",
        "packages/docs-ui/src/basics/docs-view-key.ts",
        "packages/docs-ui/src/commands/commands/__tests__/clipboard.command.spec.ts",
        "packages/sheets-ui/src/commands/commands/set-selection.command.ts",
        "packages/sheets-ui/src/controllers/defined-name/defined-name.controller.ts",
        "packages/sheets-ui/src/views/defined-name/DefinedNameContainer.tsx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "名称管理",
        "动态命名区域"
      ],
      "id": "excel-284",
      "query": "defined.*name.*formula|definedName.*formula",
      "matchedFiles": 81,
      "state": "partial",
      "sources": [
        "audit/packages/engine-formula/src/services/defined-names.service.ts",
        "audit/content/guides/sheets/features/core/defined-names.mdx"
      ],
      "note": "名称可存储公式或引用，名称解析由公式引擎接入；未做全部 OFFSET/INDIRECT 动态扩展与导入往返的兼容验收。",
      "candidateFiles": [
        "packages/sheets/src/basics/defined-name-utils.ts",
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/facade/f-workbook.ts",
        "packages/sheets/src/facade/f-defined-name.ts",
        "packages/sheets/src/facade/__tests__/create-test-bed.ts",
        "packages/sheets/src/facade/__tests__/f-defined-name.spec.ts",
        "packages/sheets/src/facade/__tests__/create-worksheet-test-bed.ts",
        "packages/sheets/src/commands/commands/remove-defined-name.command.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式编辑辅助",
        "函数参数向导"
      ],
      "id": "excel-287",
      "query": "argument.*wizard|function.*wizard",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "公式系统与计算",
        "计算控制",
        "除数据表外自动计算"
      ],
      "id": "excel-297",
      "query": "automaticExceptTables|autoNoTable",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "公式系统与计算",
        "计算控制",
        "计算工作表"
      ],
      "id": "excel-299",
      "query": "calculate.*sheet|calculateSheet",
      "matchedFiles": 38,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/sheets/sheet-skeleton.ts",
        "packages/core/src/sheets/__tests__/sheet-skeleton.integration.spec.ts",
        "packages/sheets-table/src/models/table-filter.ts",
        "packages/sheets-table/src/commands/utils/__tests__/calculated-column.spec.ts",
        "packages/sheets-table/src/controllers/__tests__/sheet-table-formula.integration.spec.ts",
        "packages/sheets-ui/src/controllers/render-controllers/header-unhide.render-controller.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/mobile-scroll.render-controller.ts",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/utils/sheet-tab-drag-sort.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "计算控制",
        "按显示精度计算"
      ],
      "id": "excel-303",
      "query": "precisionAsDisplayed|fullPrecision",
      "matchedFiles": 18,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/text/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/text/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/text/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/text/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/text/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/text/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/text/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/text/ar-SA.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "计算控制",
        "多线程计算设置"
      ],
      "id": "excel-304",
      "query": "multi.?thread|worker",
      "matchedFiles": 149,
      "state": "partial",
      "sources": [
        "audit/packages/engine-formula/src/config/config.ts",
        "audit/content/guides/sheets/features/advanced-formula.mdx"
      ],
      "note": "开源有 Worker/RPC 运行模式；高级性能与委托计算涉及 Pro。未找到 Excel 用户界面式线程数量设置。",
      "candidateFiles": [
        "packages/sheets/src/config/config.ts",
        "packages/sheets/src/commands/mutations/set-range-values.mutation.ts",
        "packages/sheets/src/controllers/basic-worksheet.controller.ts",
        "packages/sheets/src/controllers/__tests__/calculate-result-apply.controller.spec.ts",
        "packages/sheets/src/controllers/permission/sheet-permission-check.controller.ts",
        "packages/core/src/common/request-immediate-macro-task.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc.render-controller.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc-layout-progress.render-controller.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "动态数组与自定义",
        "溢出范围阻挡检测"
      ],
      "id": "excel-307",
      "query": "spill.*block",
      "matchedFiles": 2,
      "state": "oss",
      "sources": [
        "audit/packages/engine-formula/src/services/__tests__/runtime.service.spec.ts:391"
      ],
      "note": "运行时及测试区分真实 spill blockers 与上一次数组公式结果，避免误判溢出区域阻挡。",
      "candidateFiles": [
        "packages/engine-formula/src/services/__tests__/runtime.service.spec.ts",
        "content/docs/features/shared/server-calculation.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "动态数组与自定义",
        "传统 CSE 数组公式"
      ],
      "id": "excel-308",
      "query": "CSE|Ctrl.*Shift.*Enter",
      "matchedFiles": 281,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/sheets.mdx:95",
        "audit/packages/engine-formula/src/functions/base-function.ts"
      ],
      "note": "官方完整 SDK 对照表称支持；开源模型有 FormulaType.ARRAY 及传统数组标量行为，但未确认 Ctrl+Shift+Enter 输入入口与完整旧数组编辑语义，不能仅凭“未标开源”断定 Pro。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/controllers/components.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/components.controller.ts",
        "packages/docs-find-replace/src/models/docs-find.model.ts",
        "packages/docs-find-replace/src/models/__tests__/docs-find.model.spec.ts",
        "packages/sheets/src/models/range-theme-model.ts",
        "packages/sheets/src/models/__tests__/range-theme-model.spec.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "动态数组与自定义",
        "递归 LAMBDA"
      ],
      "id": "excel-312",
      "query": "recursive.*lambda|lambda.*recurs",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "追踪引用单元格"
      ],
      "id": "excel-314",
      "query": "trace.*precedent|trace.*depend",
      "matchedFiles": 1,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/sheets.mdx:100",
        "audit/packages/engine-formula/src/facade/f-formula.ts"
      ],
      "note": "Facade 提供引用/依赖树与 dependents 查询；未见 Excel 式可视化追踪箭头和完整审核交互。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "追踪从属单元格"
      ],
      "id": "excel-315",
      "query": "trace.*depend",
      "matchedFiles": 1,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/sheets.mdx:100",
        "audit/packages/engine-formula/src/facade/f-formula.ts"
      ],
      "note": "Facade 提供引用/依赖树与 dependents 查询；未见 Excel 式可视化追踪箭头和完整审核交互。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "移去箭头"
      ],
      "id": "excel-316",
      "query": "remove.*arrow",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "显示公式"
      ],
      "id": "excel-317",
      "query": "showFormula|show.*formula",
      "matchedFiles": 26,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-sort-ui/src/services/sheets-sort-ui.service.ts",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/BaseFormulaInput.tsx",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/CheckboxFormulaInput.tsx",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/ListFormulaInput.tsx",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/CustomFormulaInput.tsx",
        "packages/sheets-data-validation-ui/src/views/components/__tests__/DataValidationItem.spec.tsx",
        "packages/sheets-data-validation/src/validators/__tests__/validators.spec.ts",
        "packages/sheets-ui/src/config/config.ts"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "错误检查"
      ],
      "id": "excel-318",
      "query": "getAllFormulaError",
      "matchedFiles": 3,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-formula/src/facade/f-workbook.ts",
        "audit/packages/sheets-formula-ui/src/controllers/formula-alert-render.controller.ts"
      ],
      "note": "可枚举公式错误并渲染错误提示；不是 Excel 后台错误检查全部启发式规则。",
      "candidateFiles": [
        "packages/sheets-formula/src/facade/f-workbook.ts",
        "packages/sheets-formula/src/facade/__tests__/f-workbook-engine-formula.spec.ts",
        "content/reference/facade/workbook.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "公式求值"
      ],
      "id": "excel-319",
      "query": "evaluate.*formula",
      "matchedFiles": 5,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/formula.mdx"
      ],
      "note": "有公式执行/计算 API；未见 Excel 逐步“公式求值”调试对话框。",
      "candidateFiles": [
        "packages/sheets-conditional-formatting/src/facade/f-conditional-formatting-builder.ts",
        "packages/engine-formula/src/locale/function-list/logical/en-US.ts",
        "content/docs/features/docs.mdx",
        "content/docs/features/shared/server-calculation.mdx",
        "content/reference/facade/conditional-formatting-builder.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "监视窗口"
      ],
      "id": "excel-320",
      "query": "watch.*window",
      "matchedFiles": 2,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:100"
      ],
      "note": "官方明确没有开箱即用的 Watch Window；开发者读取单元格值不等于监视窗口。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx",
        "content/docs/examples/deepseek-harness.mdx"
      ]
    },
    {
      "path": [
        "公式系统与计算",
        "公式审核",
        "错误提示与忽略错误"
      ],
      "id": "excel-322",
      "query": "ignore.*error",
      "matchedFiles": 17,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-formula-ui/src/controllers/formula-alert-render.controller.ts"
      ],
      "note": "公式错误提示已实现；未确认持久化的“忽略此错误”工作流。",
      "candidateFiles": [
        "packages/ui/src/controllers/ui/__tests__/ui-shared.controller.spec.ts",
        "packages/engine-formula/src/basics/statistical.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/lookup/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/lookup/en-US.ts",
        "packages/engine-formula/src/locale/function-list/lookup/es-ES.ts",
        "packages/engine-formula/src/functions/lookup/tocol/index.ts",
        "packages/engine-formula/src/functions/lookup/tocol/__tests__/index.spec.ts"
      ]
    },
    {
      "path": [
        "Excel 表格（结构化表）",
        "表格行为",
        "镶边行与镶边列"
      ],
      "id": "excel-421",
      "query": "firstRowStyle|firstColumnStyle",
      "matchedFiles": 16,
      "state": "oss",
      "sources": [
        "audit/packages/sheets/src/models/range-theme-util.ts",
        "audit/packages/sheets-table/src/controllers/table-theme.factory.ts"
      ],
      "note": "RangeTheme 支持奇偶行列样式及首末列样式；表格主题工厂使用这些样式。",
      "candidateFiles": [
        "packages/sheets/src/models/range-theme-util.ts",
        "packages/sheets/src/models/__tests__/range-theme-model.spec.ts",
        "packages/sheets/src/models/__tests__/range-theme-util.spec.ts",
        "packages/sheets/src/models/range-themes/build-in-theme.factory.ts",
        "packages/sheets/src/models/range-themes/default.ts",
        "packages/sheets/src/commands/mutations/set-range-theme.mutation.ts",
        "packages/sheets/src/commands/mutations/__tests__/worksheet-protection-and-theme.mutation.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/range-template-command.sepc.ts"
      ]
    },
    {
      "path": [
        "Excel 表格（结构化表）",
        "表格行为",
        "首列与末列强调"
      ],
      "id": "excel-422",
      "query": "headerColumnStyle|lastColumnStyle",
      "matchedFiles": 6,
      "state": "oss",
      "sources": [
        "audit/packages/sheets/src/models/range-theme-util.ts",
        "audit/packages/sheets-table/src/controllers/table-theme.factory.ts"
      ],
      "note": "RangeTheme 支持奇偶行列样式及首末列样式；表格主题工厂使用这些样式。",
      "candidateFiles": [
        "packages/sheets/src/models/range-theme-util.ts",
        "packages/sheets/src/models/__tests__/range-theme-util.spec.ts",
        "packages/sheets/src/models/range-themes/build-in-theme.factory.ts",
        "packages/sheets-table/src/controllers/table-theme.factory.ts",
        "packages/sheets-table/src/controllers/__tests__/table-theme.factory.spec.ts",
        "content/guides/sheets/features/core/range-theme.mdx"
      ]
    },
    {
      "path": [
        "Excel 表格（结构化表）",
        "表格行为",
        "删除重复记录"
      ],
      "id": "excel-428",
      "query": "remove.*duplicate|dedup",
      "matchedFiles": 34,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:70"
      ],
      "note": "官方明确没有内置 Remove Duplicates 操作；UNIQUE 公式不等于原地删除重复记录。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-update.controller.spec.ts",
        "packages/ui/src/controllers/error/__tests__/error.controller.spec.ts",
        "packages/ui/src/views/notification/Notification.stories.tsx",
        "packages/ui/src/views/emoji-picker/__tests__/emoji-picker-utils.spec.ts",
        "packages/ui/src/views/components/feature-search/FeatureSearch.tsx",
        "packages/ui/src/views/components/shortcut-panel/ShortcutPanel.tsx",
        "packages/drawing/src/services/__tests__/drawing-manager-impl.service.spec.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "按颜色排序"
      ],
      "id": "excel-433",
      "query": "sort.*color|color.*sort",
      "matchedFiles": 5,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:62"
      ],
      "note": "官方明确不提供按字体/填充色排序；按颜色筛选已支持，两者不能混同。",
      "candidateFiles": [
        "packages/sheets-conditional-formatting/src/models/calculate-unit-v2/color-scale-calculate-unit.ts",
        "content/docs/features/sheets.mdx",
        "content/guides/bases/index.mdx",
        "content/guides/bases/features/core/index.mdx",
        "content/reference/facade/base-table-view.mdx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "按字体颜色排序"
      ],
      "id": "excel-434",
      "query": "sort.*font|font.*sort",
      "matchedFiles": 2,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:62"
      ],
      "note": "官方明确不提供按字体/填充色排序；按颜色筛选已支持，两者不能混同。",
      "candidateFiles": [
        "packages/ui/src/services/font.service.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "按图标排序"
      ],
      "id": "excel-435",
      "query": "sort.*icon|icon.*sort",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-sort-ui/src/mobile-plugin.ts",
        "packages/sheets-sort-ui/src/plugin.ts",
        "packages/sheets-sort-ui/src/index.ts",
        "packages/sheets-sort-ui/src/config/config.ts",
        "packages/sheets-sort-ui/src/menu/sheets-sort.menu.ts",
        "packages/sheets-sort-ui/src/controllers/ui.controller.ts",
        "packages/sheets-sort-ui/src/controllers/components.controller.ts",
        "packages/sheets-sort-ui/src/controllers/mobile/ui.controller.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "自定义序列排序"
      ],
      "id": "excel-436",
      "query": "custom.*sort",
      "matchedFiles": 23,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-sort-ui/src/locale/de-DE.ts",
        "packages/sheets-sort-ui/src/locale/pl-PL.ts",
        "packages/sheets-sort-ui/src/locale/en-US.ts",
        "packages/sheets-sort-ui/src/menu/sheets-sort.menu.ts",
        "packages/sheets-sort-ui/src/commands/commands/__tests__/sheets-sort.command.spec.ts",
        "packages/sheets-sort-ui/src/controllers/ui.controller.ts",
        "packages/sheets-sort-ui/src/controllers/components.controller.ts",
        "packages/sheets-sort-ui/src/controllers/mobile/ui.controller.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "区分大小写排序"
      ],
      "id": "excel-437",
      "query": "caseSensitive",
      "matchedFiles": 23,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/commands/operations/__tests__/find-replace.operation.spec.ts",
        "packages/find-replace/src/views/dialog/FindReplaceDialog.tsx",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceSettings.tsx",
        "packages/find-replace/src/services/find-replace.service.ts",
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts",
        "packages/docs-find-replace/src/models/__tests__/docs-find.model.spec.ts",
        "packages/docs-find-replace/src/commands/commands/__tests__/docs-replace.command.spec.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "排序",
        "按行横向排序"
      ],
      "id": "excel-438",
      "query": "sort.*row|horizontal.*sort",
      "matchedFiles": 31,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/locale/pl-PL.ts",
        "packages/sheets-sort-ui/src/views/CustomSortPanel.tsx",
        "packages/sheets-sort-ui/src/views/__tests__/SheetsSortViews.spec.tsx",
        "packages/sheets-sort-ui/src/views/mobile/MobileCustomSortPanel.tsx",
        "packages/sheets/src/commands/commands/set-row-visible.command.ts",
        "packages/sheets/src/commands/commands/util.ts",
        "packages/sheets/src/controllers/__tests__/merge-cell.controller.spec.ts",
        "packages/sheets/src/services/ref-range/util.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "日期筛选"
      ],
      "id": "excel-445",
      "query": "date.*filter|filter.*date",
      "matchedFiles": 63,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-table/src/types/enum.ts",
        "audit/packages/sheets-table/src/models/filter-util/date-filter-util.ts"
      ],
      "note": "开源结构化表具备日期前后/区间/年月季度等日期筛选执行器；这里确认日期筛选能力，不代表所有 Excel 菜单预设完全相同。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/drawing-update.controller.ts",
        "packages/drawing-ui/src/views/panel/DrawingCommonPanel.tsx",
        "packages/ui/src/locale/de-DE.ts",
        "packages/ui/src/views/object-permission/ObjectPermissionMembers.tsx",
        "packages/ui/src/views/components/feature-search/FeatureSearch.tsx",
        "packages/ui/src/views/components/context-menu/ContextMenuPanel.tsx",
        "packages/ui/src/services/font.service.ts",
        "packages/docs-find-replace/src/commands/commands/docs-replace.command.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "前十项筛选"
      ],
      "id": "excel-447",
      "query": "top10|topN|top.*filter",
      "matchedFiles": 73,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-table/src/types/enum.ts",
        "audit/packages/sheets-table/src/models/filter-util/number-filter-util.ts",
        "audit/packages/sheets-table/src/models/filter-util/date-filter-util.ts"
      ],
      "note": "开源结构化表筛选支持 TopN 与 today/本周/上月/季度/年初至今等日期条件；未确认普通 AutoFilter 全部入口和 Excel Top10 百分比语义。",
      "candidateFiles": [
        "packages/ui/src/mobile-plugin.ts",
        "packages/ui/src/plugin.ts",
        "packages/ui/src/index.ts",
        "packages/ui/src/services/notification/desktop-notification.service.ts",
        "packages/ui/src/services/notification/__tests__/desktop-notification.service.spec.ts",
        "packages/ui/src/services/before-close/__tests__/before-close.service.spec.ts",
        "packages/design/src/components/gradient-color-picker/GradientColorPicker.tsx",
        "packages/design/src/components/gradient-color-picker/MobileGradientColorPicker.tsx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "动态日期筛选"
      ],
      "id": "excel-448",
      "query": "dynamic.*filter",
      "matchedFiles": 5,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-table/src/types/enum.ts",
        "audit/packages/sheets-table/src/models/filter-util/number-filter-util.ts",
        "audit/packages/sheets-table/src/models/filter-util/date-filter-util.ts"
      ],
      "note": "开源结构化表筛选支持 TopN 与 today/本周/上月/季度/年初至今等日期条件；未确认普通 AutoFilter 全部入口和 Excel Top10 百分比语义。",
      "candidateFiles": [
        "packages/sheets-table/src/models/table-filter.ts",
        "packages/sheets-table/src/models/filter-util/condition.ts",
        "packages/sheets-table/src/models/filter-util/__tests__/filter-util.spec.ts",
        "packages/sheets-filter/src/models/types.ts",
        "packages/sheets-filter/src/models/__tests__/filter-model.spec.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "高级筛选条件区域"
      ],
      "id": "excel-451",
      "query": "criteria.*range",
      "matchedFiles": 58,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/database/en-US.ts",
        "packages/engine-formula/src/locale/function-list/math/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/math/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/math/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/math/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/math/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/math/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/math/vi-VN.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "高级筛选复制结果"
      ],
      "id": "excel-452",
      "query": "advanced.*filter",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/guides/sheets/features/pivot-chart.mdx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "筛选",
        "筛选唯一记录"
      ],
      "id": "excel-453",
      "query": "unique.*filter",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/guides/sheets/features/core/formula.mdx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "分列：固定宽度"
      ],
      "id": "excel-456",
      "query": "fixed.*width",
      "matchedFiles": 14,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/services/clipboard/__tests__/constant.ts",
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard.service.spec.ts",
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard-copy-with-default-style.spec.ts",
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard-copy-with-escape-special-code.spec.ts",
        "packages/sheets-ui/src/services/clipboard/usm-to-html/convertor.ts",
        "packages/sheets-drawing-ui/src/services/canvas-float-dom-manager.service.ts",
        "packages/engine-render/src/components/docs/layout/doc-no-wrap-measure.ts",
        "packages/engine-render/src/components/docs/layout/model/glyph.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "分列数据类型与日期解析"
      ],
      "id": "excel-457",
      "query": "split.*date|split.*type",
      "matchedFiles": 17,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/facade/f-enum.ts",
        "packages/core/src/docs/data-model/text-x/apply-utils/update-apply.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/paragraph-id.spec.ts",
        "packages/core/src/common/invert-color/invert-hsl.ts",
        "packages/docs-ui/src/services/clipboard/clipboard.service.ts",
        "packages/sheets-ui/src/controllers/render-controllers/freeze.render-controller.ts",
        "packages/sheets-conditional-formatting/src/models/calculate-unit-v2/icon-set-calculate-unit.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "删除重复值"
      ],
      "id": "excel-458",
      "query": "remove.*duplicate|dedup",
      "matchedFiles": 34,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:70"
      ],
      "note": "官方明确没有内置 Remove Duplicates 操作；UNIQUE 公式不等于原地删除重复记录。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-update.controller.spec.ts",
        "packages/ui/src/controllers/error/__tests__/error.controller.spec.ts",
        "packages/ui/src/views/notification/Notification.stories.tsx",
        "packages/ui/src/views/emoji-picker/__tests__/emoji-picker-utils.spec.ts",
        "packages/ui/src/views/components/feature-search/FeatureSearch.tsx",
        "packages/ui/src/views/components/shortcut-panel/ShortcutPanel.tsx",
        "packages/drawing/src/services/__tests__/drawing-manager-impl.service.spec.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "合并计算"
      ],
      "id": "excel-459",
      "query": "consolidat",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "分类汇总"
      ],
      "id": "excel-460",
      "query": "subtotal",
      "matchedFiles": 43,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/controllers/basic-worksheet.controller.ts",
        "packages/sheets/src/controllers/__tests__/formula/subtotal-offset.spec.ts",
        "packages/sheets/src/controllers/__tests__/formula/array-inverted-index-cache.spec.ts",
        "packages/sheets-formula-ui/src/controllers/__tests__/update-formula.controller.spec.ts",
        "packages/sheets-formula-ui/src/views/formula-editor/search-function/__tests__/SearchFunction.spec.tsx",
        "packages/engine-formula/src/basics/statistical.ts",
        "packages/engine-formula/src/locale/function-list/math/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/math/pt-BR.ts"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "自动建立分级显示"
      ],
      "id": "excel-462",
      "query": "auto.*outline",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-formula-ui/src/views/more-functions/select-function/SelectFunction.tsx",
        "content/guides/sheets/features/core/components/freeze-demo.tsx"
      ]
    },
    {
      "path": [
        "排序、筛选与整理",
        "整理与汇总",
        "快速分析工具"
      ],
      "id": "excel-464",
      "query": "quick.*analysis",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据验证与输入控制",
        "验证规则",
        "时间范围"
      ],
      "id": "excel-471",
      "query": "validation.*time|time.*validation",
      "matchedFiles": 15,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-data-validation/src/validators/date-validator.ts",
        "audit/packages/sheets-data-validation/src/validators/custom-validator.ts"
      ],
      "note": "有日期时间值及自定义公式验证；未见独立 Time 验证类型，不能等同 Excel 时间范围入口。",
      "candidateFiles": [
        "packages/sheets-data-validation-ui/src/menu/dv.menu.ts",
        "packages/sheets-data-validation-ui/src/controllers/dv-rerender.controller.ts",
        "packages/sheets-data-validation-ui/src/views/components/DateShowTimeOption.tsx",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/ListFormulaInput.tsx",
        "packages/sheets-data-validation-ui/src/services/dropdown-manager.service.ts",
        "packages/sheets-data-validation/src/validators/date-validator.ts",
        "packages/sheets-data-validation/src/services/dv-validator.service.ts",
        "packages/engine-formula/src/functions/statistical/forecast-ets-seasonality/index.ts"
      ]
    },
    {
      "path": [
        "数据验证与输入控制",
        "验证规则",
        "引用命名区域作为来源"
      ],
      "id": "excel-475",
      "query": "definedName|namedRange",
      "matchedFiles": 293,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-data-validation/src/validators/list-validator.ts",
        "audit/content/guides/sheets/features/core/defined-names.mdx"
      ],
      "note": "列表来源可由公式引擎求值，名称亦可作为公式引用；未找到命名区域作为列表来源的专门集成测试。",
      "candidateFiles": [
        "packages/sheets/src/plugin.ts",
        "packages/sheets/src/index.ts",
        "packages/sheets/src/basics/defined-name-utils.ts",
        "packages/sheets/src/locale/zh-TW.ts",
        "packages/sheets/src/locale/pt-BR.ts",
        "packages/sheets/src/locale/fa-IR.ts",
        "packages/sheets/src/locale/fr-FR.ts",
        "packages/sheets/src/locale/ca-ES.ts"
      ]
    },
    {
      "path": [
        "数据验证与输入控制",
        "提示与管理",
        "圈释无效数据"
      ],
      "id": "excel-481",
      "query": "circle.*invalid|invalid.*circle",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据验证与输入控制",
        "提示与管理",
        "清除验证标记"
      ],
      "id": "excel-482",
      "query": "clear.*valid.*mark",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "图表与迷你图",
        "基础图表",
        "曲面图"
      ],
      "id": "excel-497",
      "query": "surface",
      "matchedFiles": 39,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/facade/__tests__/f-univer.spec.ts",
        "packages/ui/src/views/notification/Notification.stories.tsx",
        "packages/ui/src/views/components/mobile-drawer/MobileDrawer.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/RibbonOverflow.spec.tsx",
        "packages/ui/src/views/components/confirm-part/__tests__/ConfirmPart.spec.tsx",
        "packages/ui/src/views/mobile-workbench/MobileCanvasLayout.tsx",
        "packages/ui/src/views/menu/mobile/__tests__/MobileMenu.spec.tsx",
        "packages/sheets-thread-comment-ui/src/views/__tests__/SheetsThreadCommentPanel.spec.tsx"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "统计与层次图表",
        "地图图表（联网与版本相关）"
      ],
      "id": "excel-509",
      "query": "map.*chart|chart.*map",
      "matchedFiles": 26,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/commands/operations/__tests__/drawing-arrange-group.operation.spec.ts",
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/__tests__/DrawingPanelActions.spec.tsx",
        "packages/drawing/src/utils/__tests__/drawing-copy-plan.spec.ts",
        "packages/sheets-drawing/src/commands/commands/__tests__/sheet-drawing.integration.spec.ts",
        "packages/sheets-drawing-ui/src/services/__tests__/canvas-float-dom-manager.service.spec.ts",
        "content/docs/features/charts.mdx",
        "content/docs/features/canvas.mdx"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表编辑",
        "推荐图表"
      ],
      "id": "excel-511",
      "query": "recommend.*chart|chart.*recommend",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "图表与迷你图",
        "图表编辑",
        "切换行列"
      ],
      "id": "excel-514",
      "query": "switch.*row|transpose|setDataSource",
      "matchedFiles": 47,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/chart.mdx"
      ],
      "note": "可用 setDataSource/setCategoryFields/setValueFields 重新绑定分类和系列；未找到 Excel 一键“切换行/列”入口及等价参数。",
      "candidateFiles": [
        "packages/sheets/src/commands/commands/__tests__/set-row-height.command.spec.ts",
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts",
        "packages/engine-formula/src/basics/math.ts",
        "packages/engine-formula/src/basics/statistical.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表编辑",
        "图表工作表"
      ],
      "id": "excel-517",
      "query": "chart.*sheet",
      "matchedFiles": 74,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:121"
      ],
      "note": "图表是普通工作表上的嵌入对象，不支持独立 chart-sheet 标签。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/__tests__/drawing-update.controller.spec.ts",
        "packages/sheets-drawing/src/commands/commands/__tests__/sheet-drawing.integration.spec.ts",
        "packages/sheets-ui/src/services/__tests__/print-interceptor.service.spec.ts",
        "packages/sheets-drawing-ui/src/index.ts",
        "packages/sheets-drawing-ui/src/services/canvas-float-dom-manager.service.ts",
        "packages/sheets-drawing-ui/src/services/__tests__/sheet-drawing-hit-test.service.spec.ts",
        "packages/sheets-drawing-ui/src/services/__tests__/canvas-float-dom-manager.service.spec.ts",
        "content/docs/features/charts.mdx"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表编辑",
        "保存图表模板"
      ],
      "id": "excel-518",
      "query": "chart.*template",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "数据表"
      ],
      "id": "excel-529",
      "query": "dataTable|data.*table",
      "matchedFiles": 192,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/utils/cell.ts",
        "packages/ui/src/views/mobile-workbench/__tests__/MobileWorkbench.spec.tsx",
        "packages/ui/src/services/clipboard/__tests__/clipboard-interface.service.spec.ts",
        "packages/docs-find-replace/src/controllers/__tests__/utils.spec.ts",
        "packages/drawing/src/services/__tests__/drawing-manager-impl.service.spec.ts",
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/facade/f-range.ts",
        "packages/sheets/src/facade/__tests__/create-test-bed.ts"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "误差线"
      ],
      "id": "excel-530",
      "query": "errorBar|error.*bar",
      "matchedFiles": 13,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:124"
      ],
      "note": "官方对趋势线/误差线/次坐标轴组合项标部分支持，并明确写出误差线不支持。",
      "candidateFiles": [
        "packages/drawing-ui/src/locale/id-ID.ts",
        "packages/ui/src/views/components/ribbon/__tests__/TooltipButtonWrapper.spec.tsx",
        "packages/sheets-data-validation-ui/src/locale/de-DE.ts",
        "packages/sheets-ui/src/locale/ca-ES.ts",
        "packages/sheets-ui/src/locale/id-ID.ts",
        "packages/sheets-ui/src/views/formula-bar/__tests__/FormulaBar.spec.tsx",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/utils/slide-tab-bar.ts",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/utils/__tests__/slide-tab-bar.spec.ts"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "趋势线"
      ],
      "id": "excel-531",
      "query": "trendLine|trend.*line",
      "matchedFiles": 9,
      "state": "pro",
      "sources": [
        "audit/content/docs/features/sheets.mdx:124"
      ],
      "note": "官方明确支持趋势线及次坐标轴；图表模块属于 Pro，误差线不支持。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/statistical/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/de-DE.ts",
        "packages/engine-formula/src/locale/function-list/statistical/id-ID.ts",
        "content/docs/features/charts.mdx",
        "content/docs/features/sheets.mdx",
        "content/guides/sheets/features/charts.mdx",
        "content/reference/facade/axis-three-d-chart-builder.mdx",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "系列颜色与标记"
      ],
      "id": "excel-532",
      "query": "setPalette|marker",
      "matchedFiles": 134,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/chart.mdx"
      ],
      "note": "Pro 图表提供 setPalette 系列配色；本轮未确认所有图表逐系列标记形状、尺寸与 Excel 一致。",
      "candidateFiles": [
        "packages/ui/src/services/font.service.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-popup.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/render-controllers/drawing.render-controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/render-controllers/render.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/__tests__/sheets-thread-comment-hover.controller.spec.ts",
        "packages/design/src/helper/__tests__/clsx.spec.ts",
        "packages/drawing/src/services/__tests__/drawing-manager-impl.service.spec.ts",
        "packages/sheets-drawing/src/facade/f-worksheet.ts"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "图表样式与布局"
      ],
      "id": "excel-533",
      "query": "setTheme|setAppearance",
      "matchedFiles": 70,
      "state": "pro",
      "sources": [
        "audit/content/reference/facade/chart.mdx"
      ],
      "note": "FChart.setTheme/setAppearance/setLegend 等提供图表主题、外观与元素布局配置；不表示兼容 Excel 每个预设。",
      "candidateFiles": [
        "packages/sheets/src/facade/__tests__/create-test-bed.ts",
        "packages/sheets/src/facade/__tests__/create-worksheet-test-bed.ts",
        "packages/core/src/univer.ts",
        "packages/core/src/facade/f-univer.ts",
        "packages/core/src/facade/__tests__/f-univer.spec.ts",
        "packages/core/src/services/theme/theme.service.ts",
        "packages/core/src/services/theme/__tests__/theme.service.spec.ts",
        "packages/docs-ui/src/basics/__tests__/doc-custom-range-chrome.spec.ts"
      ]
    },
    {
      "path": [
        "图表与迷你图",
        "图表元素",
        "图表筛选"
      ],
      "id": "excel-534",
      "query": "filter",
      "matchedFiles": 1059,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/services/find-replace.service.ts",
        "packages/drawing-ui/src/locale/zh-TW.ts",
        "packages/drawing-ui/src/locale/pt-BR.ts",
        "packages/drawing-ui/src/locale/fa-IR.ts",
        "packages/drawing-ui/src/locale/fr-FR.ts",
        "packages/drawing-ui/src/locale/ca-ES.ts",
        "packages/drawing-ui/src/locale/zh-CN.ts"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "透视表创建",
        "从外部连接创建"
      ],
      "id": "excel-546",
      "query": "external.*pivot|pivot.*external",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据透视表与透视图",
        "透视表创建",
        "从数据模型创建"
      ],
      "id": "excel-547",
      "query": "data.*model.*pivot|pivot.*model",
      "matchedFiles": 12,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx",
        "content/guides/bases/features/dashboard.mdx",
        "content/reference/facade/sheet-pivot-chart.mdx",
        "content/reference/facade/events.mdx",
        "content/reference/facade/base-pivot-view.mdx",
        "content/reference/facade/worksheet.mdx",
        "content/reference/facade/pivot-table.mdx",
        "content/reference/packages/plugins/univerjs-pro/engine-pivot.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "透视表创建",
        "推荐数据透视表"
      ],
      "id": "excel-548",
      "query": "recommend.*pivot",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据透视表与透视图",
        "字段与计算",
        "数字格式"
      ],
      "id": "excel-556",
      "query": "setFieldSetting",
      "matchedFiles": 3,
      "state": "pro",
      "sources": [
        "audit/content/reference/facade/pivot-table.mdx:1042"
      ],
      "note": "FPivotTable.setFieldSetting 可设置数值字段 format。",
      "candidateFiles": [
        "content/guides/sheets/getting-started/node.mdx",
        "content/reference/facade/sheet-pivot-chart.mdx",
        "content/reference/facade/pivot-table.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "字段与计算",
        "计算字段"
      ],
      "id": "excel-557",
      "query": "calculatedField|calculated.*field",
      "matchedFiles": 7,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:113"
      ],
      "note": "官方 Sheets 功能对照表明确不支持透视表计算字段和计算项。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx",
        "content/docs/features/docs.mdx",
        "content/docs/features/relational-table.mdx",
        "content/guides/sheets/features/slicer.mdx",
        "content/reference/facade/sheet-pivot-chart.mdx",
        "content/reference/facade/worksheet.mdx",
        "content/reference/facade/pivot-table.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "字段与计算",
        "计算项"
      ],
      "id": "excel-558",
      "query": "calculatedItem|calculated.*item",
      "matchedFiles": 3,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:113"
      ],
      "note": "官方 Sheets 功能对照表明确不支持透视表计算字段和计算项。",
      "candidateFiles": [
        "packages/sheets-table/src/models/table-filter.ts",
        "packages/sheets-table/src/models/filter-util/condition.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "布局与操作",
        "分类汇总位置"
      ],
      "id": "excel-565",
      "query": "subtotal.*position|subtotal.*top",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/math/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/math/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/math/id-ID.ts",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "布局与操作",
        "空值错误显示"
      ],
      "id": "excel-570",
      "query": "empty.*display|error.*display",
      "matchedFiles": 9,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/facade/f-enum.ts",
        "packages/sheets-data-validation-ui/src/views/components/__tests__/DataValidationOptions.spec.tsx",
        "packages/sheets-data-validation/src/facade/f-data-validation-builder.ts",
        "packages/engine-formula/src/locale/function-list/lookup/en-US.ts",
        "packages/sheets-hyper-link-ui/src/views/CellLinkEdit.tsx",
        "packages/sheets-hyper-link-ui/src/views/MobileCellLinkEdit.tsx",
        "packages/sheets-find-replace/src/controllers/__tests__/sheet-find-replace.controller.spec.ts",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "布局与操作",
        "显示无数据项目"
      ],
      "id": "excel-571",
      "query": "show.*no.*data",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/charts.mdx",
        "content/docs/features/slides.mdx",
        "content/docs/features/canvas.mdx",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "布局与操作",
        "刷新与刷新全部"
      ],
      "id": "excel-575",
      "query": "refresh|automatically.*update",
      "matchedFiles": 325,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/pivot-table.mdx:56"
      ],
      "note": "官方说明源数据变化会自动更新透视表；未见 Excel 外部连接“刷新全部”工作流。",
      "candidateFiles": [
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceSettings.tsx",
        "packages/drawing-ui/src/controllers/drawing-update.controller.ts",
        "packages/drawing-ui/src/controllers/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/image-cropper.controller.ts",
        "packages/drawing-ui/src/controllers/__tests__/drawing-update.controller.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-cropper.controller.spec.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-update.controller.spec.ts"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "布局与操作",
        "保留格式与布局"
      ],
      "id": "excel-576",
      "query": "preserve.*format|retain.*format",
      "matchedFiles": 25,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/services/format-painter/format-painter-session.service.ts",
        "packages/sheets-numfmt-ui/src/views/__tests__/SheetNumfmtPanel.spec.tsx",
        "packages/sheets/src/commands/mutations/set-range-values.mutation.ts",
        "packages/sheets/src/controllers/__tests__/auto-fill.controller.spec.ts",
        "packages/core/src/shared/compare.ts",
        "packages/core/src/shared/numfmt/__tests__/api.spec.ts",
        "packages/core/src/docs/data-model/text-x/apply-utils/__tests__/update-apply.spec.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/transform-utils.spec.ts"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "交互展示",
        "GETPIVOTDATA 取数"
      ],
      "id": "excel-582",
      "query": "GETPIVOTDATA",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ar-SA.ts"
      ]
    },
    {
      "path": [
        "数据透视表与透视图",
        "交互展示",
        "显示报表筛选页"
      ],
      "id": "excel-583",
      "query": "report.*filter.*page",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "XML 数据"
      ],
      "id": "excel-588",
      "query": "xml",
      "matchedFiles": 176,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/views/image-preview/mobile-image-preview-button.ts",
        "packages/ui/src/index.ts",
        "packages/ui/src/services/format-painter/format-painter-canvas.ts",
        "packages/ui/src/services/clipboard/clipboard-interface.service.ts",
        "packages/ui/src/services/clipboard/__tests__/clipboard-interface.service.spec.ts",
        "packages/sheets-drawing/src/facade/f-worksheet.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "JSON 数据"
      ],
      "id": "excel-589",
      "query": "json",
      "matchedFiles": 592,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/package.json",
        "packages/find-replace/src/mobile-plugin.ts",
        "packages/find-replace/src/plugin.ts",
        "packages/drawing-ui/package.json",
        "packages/drawing-ui/src/mobile-plugin.ts",
        "packages/drawing-ui/src/plugin.ts",
        "packages/ui/package.json",
        "packages/ui/src/mobile-plugin.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "文件夹批量文件"
      ],
      "id": "excel-590",
      "query": "folder",
      "matchedFiles": 29,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/index.mdx",
        "content/server/import-export/meta.ko-KR.json",
        "content/server/import-export/meta.es-ES.json",
        "content/server/import-export/meta.ja-JP.json",
        "content/server/import-export/meta.zh-CN.json",
        "content/server/import-export/meta.ru-RU.json",
        "content/server/import-export/meta.zh-TW.json",
        "content/server/import-export/meta.fr-FR.json"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "数据库连接"
      ],
      "id": "excel-591",
      "query": "database|mysql|postgres",
      "matchedFiles": 140,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/utils/storage-driver.ts",
        "packages/ui/src/views/components/ribbon/ribbon-menu/DefaultMenu.tsx",
        "packages/drawing/src/index.ts",
        "packages/drawing/src/models/image-model-interface.ts",
        "packages/protocol/src/ts/universer/v1/snapshot.ts",
        "packages/docs-drawing-ui/src/controllers/doc-float-dom.controller.ts",
        "packages/sheets-formula/src/facade/f-formula.ts",
        "packages/sheets-formula-ui/src/locale/zh-TW.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "ODBC / OLE DB"
      ],
      "id": "excel-592",
      "query": "odbc|oledb",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "网页数据"
      ],
      "id": "excel-593",
      "query": "web.*data|html.*table",
      "matchedFiles": 47,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/utils/cell.ts",
        "packages/ui/src/utils/__tests__/cell.spec.ts",
        "packages/ui/src/services/clipboard/__tests__/clipboard-interface.service.spec.ts",
        "packages/core/src/sheets/range.ts",
        "packages/docs-ui/src/embed-docs-custom-block-scroll.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc-clipboard.controller.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/doc-clipboard.controller.spec.ts",
        "packages/docs-ui/src/services/clipboard/udm-to-html/convertor.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "SharePoint 数据"
      ],
      "id": "excel-594",
      "query": "sharepoint",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "OData 数据源"
      ],
      "id": "excel-595",
      "query": "odata",
      "matchedFiles": 14,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/index.ts",
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/sheets/src/commands/mutations/set-range-values.mutation.ts",
        "packages/sheets/src/commands/utils/handle-range.mutation.ts",
        "packages/sheets/src/services/auto-fill/__tests__/tool.spec.ts",
        "packages/core/src/common/regexp/charset.ts",
        "packages/slides/src/basics/demo-data.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "导入来源",
        "Microsoft Access（平台相关）"
      ],
      "id": "excel-596",
      "query": "access.*database",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/collaboration/extensions.mdx",
        "content/ai/packages.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "查询与连接窗格"
      ],
      "id": "excel-598",
      "query": "connection.*pane",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "连接属性"
      ],
      "id": "excel-599",
      "query": "connection.*propert",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/functions/cube/cubememberproperty/index.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "连接凭据"
      ],
      "id": "excel-600",
      "query": "credential",
      "matchedFiles": 17,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/network/src/services/http/http.service.ts",
        "packages/network/src/services/http/request.ts",
        "packages/network/src/services/http/interceptors/__tests__/merge-interceptor.spec.ts",
        "packages/network/src/services/http/__tests__/request.spec.ts",
        "packages/network/src/services/http/implementations/xhr.ts",
        "packages/network/src/services/http/implementations/util.ts",
        "packages/network/src/services/http/implementations/__tests__/xhr.spec.ts",
        "packages/network/src/services/http/implementations/__tests__/fetch.spec.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "隐私级别"
      ],
      "id": "excel-601",
      "query": "privacy.*level",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "刷新连接"
      ],
      "id": "excel-602",
      "query": "refresh.*connect",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/thread-comment/src/models/__tests__/thread-comment.model.spec.ts",
        "content/server/collaboration/browser-integration.mdx",
        "content/docs/get-started.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "打开文件时刷新"
      ],
      "id": "excel-603",
      "query": "refresh.*open",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/commands/commands/refresh-header-footer-fields.command.ts",
        "packages/docs-ui/src/controllers/ui.controller.ts",
        "packages/docs-ui/src/services/mobile/doc-selection-render.service.ts",
        "packages/docs-ui/src/services/selection/doc-selection-render.service.ts",
        "packages/sheets-formula-ui/src/controllers/__tests__/formula-alert-render.controller.spec.ts",
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/guides/docs/features/core/index.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "定时刷新"
      ],
      "id": "excel-604",
      "query": "scheduled.*refresh|interval.*refresh",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "后台刷新"
      ],
      "id": "excel-605",
      "query": "background.*refresh",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "取消刷新"
      ],
      "id": "excel-606",
      "query": "cancel.*refresh",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts",
        "packages/docs-ui/src/__tests__/embed-docs-custom-block-refresh.spec.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "外部工作簿链接管理"
      ],
      "id": "excel-607",
      "query": "external.*link",
      "matchedFiles": 6,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/sheets.mdx:101",
        "audit/packages/engine-formula/src/services/unit-reference-resolver.service.ts"
      ],
      "note": "可识别外部 Excel 引用并使用保存的缓存值；外部文件不会自动加载/刷新，未见 Excel 完整编辑链接管理器。",
      "candidateFiles": [
        "packages/sheets-hyper-link/src/services/__tests__/parser.service.spec.ts",
        "packages/sheets-hyper-link-ui/src/services/__tests__/resolver.service.spec.ts",
        "content/docs/features/sheets.mdx",
        "content/docs/features/relational-table.mdx",
        "content/guides/sheets/features/hyper-link.mdx",
        "content/guides/sheets/features/core/formula.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "更改链接源"
      ],
      "id": "excel-608",
      "query": "change.*(link|source)",
      "matchedFiles": 60,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-update.controller.spec.ts",
        "packages/drawing-ui/src/controllers/mobile/image-update.controller.ts",
        "packages/drawing/src/services/__tests__/image-io-impl.service.spec.ts",
        "packages/sheets-drawing/src/facade/__tests__/f-univer.spec.ts",
        "packages/core/src/bases/typedef.ts",
        "packages/docs-ui/src/views/header-footer/panel/DocHeaderFooterOptions.tsx",
        "packages/docs-ui/src/views/header-footer/panel/use-header-footer-options.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "连接管理",
        "断开链接"
      ],
      "id": "excel-609",
      "query": "break.*link",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/services/clipboard/__tests__/clipboard.service.spec.ts",
        "packages/docs/src/facade/f-document-section.ts",
        "packages/engine-render/src/components/docs/layout/__tests__/tools.spec.ts",
        "packages/engine-render/src/components/docs/layout/line-breaker/break.ts",
        "packages/engine-render/src/components/docs/layout/line-breaker/enhancers/link-enhancer.ts",
        "packages/engine-render/src/components/docs/layout/line-breaker/enhancers/hyphen-enhancer.ts",
        "packages/engine-render/src/components/docs/layout/line-breaker/enhancers/__tests__/link-enhancer.spec.ts",
        "packages/engine-render/src/components/docs/layout/block/paragraph/shaping.ts"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "结构化数据交换",
        "XML 映射（平台相关）"
      ],
      "id": "excel-611",
      "query": "xml.*map",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/views/permission/panel-list/constant.ts",
        "packages/sheets-ui/src/views/permission/user-dialog/constant.ts",
        "content/docs/features/shared/file-conversion.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "结构化数据交换",
        "XML 导入导出"
      ],
      "id": "excel-612",
      "query": "xml.*(import|export)",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/services/format-painter/format-painter-canvas.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/docs/src/facade/__tests__/f-document.spec.ts",
        "content/docs/features/pdf.mdx"
      ]
    },
    {
      "path": [
        "外部数据与连接",
        "结构化数据交换",
        "旧版文本导入向导"
      ],
      "id": "excel-613",
      "query": "text.*import.*wizard",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "结构化数据交换",
        "连接文件 ODC"
      ],
      "id": "excel-614",
      "query": "\\bodc\\b",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "外部数据与连接",
        "结构化数据交换",
        "实时数据 RTD（Windows）"
      ],
      "id": "excel-615",
      "query": "\\brtd\\b",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该连接器/连接管理的直接实现。README 的概括性 Data connectors 描述不足以确认此具体来源或操作。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ar-SA.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "查询编辑器"
      ],
      "id": "excel-618",
      "query": "power.?query|query.*editor",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/controllers/render-controllers/__tests__/doc.render-controller.spec.ts",
        "packages/sheets-ui/src/views/formula-bar/__tests__/FormulaBar.spec.tsx",
        "packages/sheets-ui/src/views/editor-container/__tests__/EditorContainer.spec.tsx",
        "content/guides/sheets/features/edit-history.mdx",
        "content/guides/bases/features/edit-history.mdx",
        "content/guides/docs/features/edit-history.mdx",
        "content/guides/slides/features/edit-history.mdx",
        "content/guides/boards/features/edit-history.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "应用步骤"
      ],
      "id": "excel-619",
      "query": "applied.*step",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "M 语言高级编辑器"
      ],
      "id": "excel-620",
      "query": "M language|M语言",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/guides/sheets/getting-started/i18n.mdx",
        "content/guides/bases/getting-started/i18n.mdx",
        "content/guides/docs/getting-started/i18n.mdx",
        "content/guides/slides/getting-started/i18n.mdx",
        "content/guides/boards/getting-started/i18n.mdx",
        "content/guides/pdfs/getting-started/i18n.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "查询引用"
      ],
      "id": "excel-621",
      "query": "query.*reference",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-formula-ui/src/views/formula-editor/hooks/__tests__/use-highlight.spec.ts",
        "content/guides/sheets/features/edit-history.mdx",
        "content/guides/bases/features/edit-history.mdx",
        "content/guides/docs/features/edit-history.mdx",
        "content/guides/slides/features/edit-history.mdx",
        "content/guides/boards/features/edit-history.mdx",
        "content/reference/packages/plugins/univerjs-pro/sheets-slicer-ui.mdx",
        "content/reference/packages/presets/univerjs/preset-sheets-advanced.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "查询复制"
      ],
      "id": "excel-622",
      "query": "query.*duplicate",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "参数"
      ],
      "id": "excel-623",
      "query": "power.?query.*param",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "自定义函数"
      ],
      "id": "excel-624",
      "query": "power.?query.*function",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "查询构建",
        "查询依赖关系"
      ],
      "id": "excel-625",
      "query": "query.*depend",
      "matchedFiles": 15,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/emoji-picker/__tests__/EmojiPicker.spec.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/ToolbarItem.spec.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/TooltipButtonWrapper.spec.tsx",
        "packages/engine-formula/src/index.ts",
        "packages/engine-formula/src/facade/f-formula.ts",
        "packages/engine-formula/src/facade/__tests__/f-formula.spec.ts",
        "packages/engine-formula/src/commands/mutations/set-formula-calculation.mutation.ts",
        "packages/engine-formula/src/commands/mutations/__tests__/formula-reference.mutation.spec.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "选择删除重命名列"
      ],
      "id": "excel-627",
      "query": "power.?query.*column",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "更改数据类型"
      ],
      "id": "excel-628",
      "query": "power.?query.*type",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "替换值与错误"
      ],
      "id": "excel-629",
      "query": "power.?query.*replace",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "移除空行与错误"
      ],
      "id": "excel-630",
      "query": "power.?query.*remove",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "填充空值"
      ],
      "id": "excel-631",
      "query": "power.?query.*fill",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "拆分列与合并列"
      ],
      "id": "excel-632",
      "query": "power.?query.*split",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "提取文本"
      ],
      "id": "excel-633",
      "query": "power.?query.*text",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "日期时间转换"
      ],
      "id": "excel-634",
      "query": "power.?query.*date",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "条件列"
      ],
      "id": "excel-635",
      "query": "conditional.*column",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-filter-ui/src/services/__tests__/sheets-filter-panel.service.spec.ts",
        "packages/sheets-conditional-formatting/src/models/calculate-unit-v2/__tests__/calculate.highlight.spec.ts",
        "packages/sheets-conditional-formatting/src/services/__tests__/conditional-formatting.service.spec.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "自定义列"
      ],
      "id": "excel-636",
      "query": "custom.*column",
      "matchedFiles": 50,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/menu/desktop/__tests__/DesignTinyMenuGroup.spec.tsx",
        "packages/sheets-sort-ui/src/services/__tests__/sheets-sort-ui.service.spec.ts",
        "packages/sheets/src/basics/row-column-value.ts",
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/facade/f-worksheet.ts",
        "packages/sheets/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/sheets/src/commands/mutations/set-col-data.mutation.ts",
        "packages/sheets/src/commands/commands/set-range-custom-metadata.command.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "索引列"
      ],
      "id": "excel-637",
      "query": "index.*column",
      "matchedFiles": 348,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-popup.controller.ts",
        "packages/sheets-thread-comment-ui/src/views/SheetsThreadCommentPanel.tsx",
        "packages/sheets-sort-ui/src/views/CustomSortPanel.tsx",
        "packages/sheets-sort-ui/src/views/mobile/MobileCustomSortPanel.tsx",
        "packages/sheets-sort-ui/src/services/sheets-sort-ui.service.ts",
        "packages/sheets-drawing/src/facade/f-worksheet.ts",
        "packages/sheets-drawing/src/controllers/sheet-drawing-transform-affected.controller.ts",
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "分组聚合"
      ],
      "id": "excel-638",
      "query": "group.*aggregate",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "透视列"
      ],
      "id": "excel-639",
      "query": "pivot.*column",
      "matchedFiles": 18,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/services/permission/worksheet-permission/utils.ts",
        "packages/engine-formula/src/basics/statistical.ts",
        "content/docs/features/sheets.mdx",
        "content/docs/features/relational-table.mdx",
        "content/guides/sheets/features/slicer.mdx",
        "content/guides/sheets/features/pivot-chart.mdx",
        "content/guides/sheets/features/pivot-table.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "逆透视列"
      ],
      "id": "excel-640",
      "query": "unpivot",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "转置"
      ],
      "id": "excel-641",
      "query": "transpose",
      "matchedFiles": 36,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/commands/commands/__tests__/set-row-height.command.spec.ts",
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts",
        "packages/engine-formula/src/basics/math.ts",
        "packages/engine-formula/src/basics/statistical.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "清洗转换",
        "去重与排序"
      ],
      "id": "excel-642",
      "query": "dedup|sort",
      "matchedFiles": 468,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/controllers/drawing-update.controller.ts",
        "packages/drawing-ui/src/controllers/__tests__/image-update.controller.spec.ts",
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "packages/ui/src/locale/de-DE.ts",
        "packages/ui/src/locale/pl-PL.ts",
        "packages/ui/src/locale/en-US.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "合并查询 Join"
      ],
      "id": "excel-644",
      "query": "merge.*query|join",
      "matchedFiles": 214,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/facade/f-menu-builder.ts",
        "packages/ui/src/utils/cell.ts",
        "packages/ui/src/utils/__tests__/cell.spec.ts",
        "packages/ui/src/views/emoji-picker/emoji-picker-utils.ts",
        "packages/ui/src/views/components/mobile-zoom-indicator/mobile-zoom-indicator.ts",
        "packages/ui/src/views/components/feature-search/FeatureSearch.tsx",
        "packages/ui/src/views/components/context-menu/ContextMenuPanel.tsx",
        "packages/ui/src/views/menu/mobile/MobileMenu.tsx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "追加查询 Union"
      ],
      "id": "excel-645",
      "query": "append.*query|union",
      "matchedFiles": 51,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/basics/expand-range.ts",
        "packages/sheets/src/locale/it-IT.ts",
        "packages/sheets/src/commands/commands/utils/selection-utils.ts",
        "packages/sheets/src/controllers/__tests__/formula/create-function-test-bed.ts",
        "packages/sheets/src/services/auto-fill/auto-fill.service.ts",
        "packages/core/src/types/interfaces/i-style-data.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/shared/rectangle.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "展开嵌套表"
      ],
      "id": "excel-646",
      "query": "expand.*nested",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/dialog-part/__tests__/MobileDialogPart.spec.tsx",
        "packages/drawing/src/services/drawing-manager-impl.service.ts",
        "packages/drawing/src/services/__tests__/drawing-manager-impl.service.spec.ts",
        "packages/engine-render/src/components/docs/layout/model/__tests__/page.spec.ts",
        "content/guides/docs/features/core/index.mdx",
        "content/reference/facade/worksheet.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "合并文件"
      ],
      "id": "excel-647",
      "query": "combine.*file",
      "matchedFiles": 7,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/collaboration/extensions.mdx",
        "content/docs/features/docs.mdx",
        "content/docs/features/shared/server-calculation.mdx",
        "content/docs/features/shared/file-conversion.mdx",
        "content/docs/examples/index.mdx",
        "content/docs/examples/deepseek-harness.mdx",
        "content/docs/examples/workspace.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "模糊匹配（连接器相关）"
      ],
      "id": "excel-648",
      "query": "fuzzy.*match",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/engine/value-object/array-value-object.ts",
        "packages/engine-render/src/scene.ts"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "加载到工作表"
      ],
      "id": "excel-649",
      "query": "load.*worksheet",
      "matchedFiles": 7,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/services/permission/worksheet-permission/__tests__/worksheet-permission.service.spec.ts",
        "packages/sheets-drawing-ui/src/controllers/__tests__/sheet-drawing-update.controller.spec.ts",
        "packages/engine-formula/src/services/hyperlink-engine-formula.service.ts",
        "content/docs/features/shared/embed.mdx",
        "content/guides/fundamentals/features/embed.mdx",
        "content/guides/sheets/features/collaboration.mdx",
        "content/reference/packages/plugins/univerjs/sheets-drawing.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "仅创建连接"
      ],
      "id": "excel-650",
      "query": "connection.*only",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/index.mdx",
        "content/reference/facade/sheet-timeline.mdx",
        "content/reference/facade/sheet-slicer.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "加载到数据模型"
      ],
      "id": "excel-651",
      "query": "load.*data.*model",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/bases/__tests__/formula-table-name.spec.ts",
        "packages/docs/src/facade/f-document.ts",
        "packages/engine-formula/src/services/__tests__/current-data.service.spec.ts",
        "content/reference/packages/plugins/univerjs-pro/chart-embed.mdx"
      ]
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "刷新查询"
      ],
      "id": "excel-652",
      "query": "refresh.*query",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "Power Query 获取与转换",
        "组合与加载",
        "数据分析与列质量"
      ],
      "id": "excel-653",
      "query": "column.*quality",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Query 查询编辑器、M 语言求值器及查询步骤/加载管线。普通工作表公式或数据处理函数不计为 Power Query。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "添加表到数据模型"
      ],
      "id": "excel-656",
      "query": "power.?pivot|data.?model",
      "matchedFiles": 573,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/ui/src/common/menu-hidden-observable.ts",
        "packages/ui/src/views/components/dom/FloatDom.tsx",
        "packages/ui/src/services/layout/layout.service.ts",
        "packages/sheets-thread-comment-ui/src/views/__tests__/SheetsThreadCommentPanel.spec.tsx",
        "packages/docs-find-replace/src/models/docs-find.model.ts",
        "packages/docs-find-replace/src/commands/commands/docs-replace.command.ts",
        "packages/docs-find-replace/src/commands/commands/__tests__/docs-ui-test-bed.d.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "创建表关系"
      ],
      "id": "excel-657",
      "query": "relationship",
      "matchedFiles": 42,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing/src/utils/drawing-copy-plan.ts",
        "packages/sheets-drawing/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/thread-comment/src/commands/commands/__tests__/comment.command.spec.ts",
        "packages/engine-formula/src/locale/function-list/statistical/en-US.ts",
        "packages/engine-formula/src/facade/f-formula.ts",
        "packages/engine-formula/src/models/utils/formula-data-util.ts",
        "packages/engine-formula/src/engine/dependency/formula-dependency.ts",
        "packages/engine-formula/src/services/dependency-manager.service.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "关系图视图"
      ],
      "id": "excel-658",
      "query": "relationship.*diagram",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/canvas.mdx",
        "content/blog/univer-1-0.mdx"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "关系基数与键"
      ],
      "id": "excel-659",
      "query": "cardinality",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/basics/inverted-index-cache.ts",
        "content/docs/features/canvas.mdx",
        "content/reference/facade/enums.mdx",
        "content/reference/facade/board.mdx"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "日期表"
      ],
      "id": "excel-660",
      "query": "date.*table",
      "matchedFiles": 122,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/mobile-workbench/MobileWorkbench.tsx",
        "packages/ui/src/views/mobile-workbench/__tests__/MobileWorkbench.spec.tsx",
        "packages/design/src/components/radio/__tests__/Radio.spec.tsx",
        "packages/core/src/shared/numfmt/__tests__/ssf-dates.spec.ts",
        "packages/core/src/docs/data-model/text-x/structure-validator.ts",
        "packages/core/src/docs/data-model/text-x/apply-utils/update-apply.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/tables.spec.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/paragraph-id.spec.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "隐藏客户端字段"
      ],
      "id": "excel-661",
      "query": "hide.*client",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/canvas.mdx",
        "content/blog/custom-import.mdx"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "层次结构"
      ],
      "id": "excel-662",
      "query": "hierarch",
      "matchedFiles": 44,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/dom/__tests__/FloatDom.spec.tsx",
        "packages/core/src/univer.ts",
        "packages/core/src/types/interfaces/i-drawing.ts",
        "packages/core/src/bases/typedef.ts",
        "packages/core/src/bases/index.ts",
        "packages/core/src/docs/data-model/preset-list-type.ts",
        "packages/docs/src/controllers/__tests__/doc-permission.controller.spec.ts",
        "packages/docs-drawing-ui/src/controllers/doc-drawing-notification.controller.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "模型",
        "KPI"
      ],
      "id": "excel-663",
      "query": "\\bkpi\\b",
      "matchedFiles": 18,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/cube/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/cube/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/cube/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/cube/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/cube/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/cube/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/cube/ar-SA.ts",
        "packages/engine-formula/src/locale/function-list/cube/it-IT.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "DAX 计算列"
      ],
      "id": "excel-665",
      "query": "\\bdax\\b",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "DAX 度量值"
      ],
      "id": "excel-666",
      "query": "measure",
      "matchedFiles": 119,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/ribbon/RibbonGrid.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/RibbonGrid.spec.tsx",
        "packages/ui/src/views/mobile-workbench/MobileCanvasLayout.tsx",
        "packages/ui/src/services/font.service.ts",
        "packages/ui/src/services/__tests__/font.service.spec.ts",
        "packages/design/src/components/color-picker/__tests__/ColorSpectrum.spec.tsx",
        "packages/design/src/hooks/use-mobile-keyboard-viewport.ts",
        "packages/sheets/src/basics/__tests__/expand.data.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "筛选上下文"
      ],
      "id": "excel-667",
      "query": "filter.*context",
      "matchedFiles": 13,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/services/ribbon/ribbon.service.ts",
        "packages/ui/src/services/ribbon/__tests__/ribbon.service.spec.ts",
        "packages/sheets/src/services/sheet-interceptor/sheet-interceptor.service.ts",
        "packages/sheets-table-ui/src/controllers/sheet-table-filter-button-render.controller.ts",
        "packages/sheets-table-ui/src/controllers/__tests__/sheet-table-component.controller.spec.ts",
        "packages/docs-drawing-ui/src/controllers/render-controllers/doc-drawing-update.render-controller.ts",
        "packages/docs-drawing-ui/src/controllers/render-controllers/doc-drawing-anchor.render-controller.ts",
        "packages/sheets-conditional-formatting/src/models/calculate-unit-v2/icon-set-calculate-unit.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "时间智能"
      ],
      "id": "excel-668",
      "query": "time.*intelligence",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "跨表聚合"
      ],
      "id": "excel-669",
      "query": "cross.*table.*aggregat",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "数据模型透视分析"
      ],
      "id": "excel-670",
      "query": "model.*pivot",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx",
        "content/reference/facade/base-pivot-view.mdx",
        "content/reference/packages/plugins/univerjs-pro/pivot-chart.mdx",
        "content/reference/packages/plugins/univerjs-pro/sheets-pivot-chart.mdx",
        "content/reference/packages/presets/univerjs/preset-sheets-advanced.mdx"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "模型导入与刷新"
      ],
      "id": "excel-671",
      "query": "model.*refresh",
      "matchedFiles": 9,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/models/__tests__/range-theme-model.spec.ts",
        "packages/sheets/src/controllers/zebar-crossing.controller.ts",
        "packages/sheets/src/controllers/permission/sheet-permission-check.controller.ts",
        "packages/sheets/src/controllers/permission/sheet-permission-init.controller.ts",
        "packages/sheets/src/services/permission/worksheet-permission/__tests__/worksheet-permission-models.spec.ts",
        "packages/docs-ui/src/controllers/ui.controller.ts",
        "packages/sheets-ui/src/views/permission/SheetPermissionPanelList.tsx",
        "packages/engine-render/src/components/docs/layout/__tests__/doc-skeleton.spec.ts"
      ]
    },
    {
      "path": [
        "数据模型与 Power Pivot",
        "DAX 与分析",
        "模型大小与内存管理"
      ],
      "id": "excel-672",
      "query": "model.*memory",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见 Power Pivot 关系模型与 DAX 求值器。表格、普通透视表和层次图表不是 Excel 数据模型功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "单变量求解 Goal Seek"
      ],
      "id": "excel-675",
      "query": "goal.?seek",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:130"
      ],
      "note": "官方明确未提供内置 Goal Seek、单/双变量模拟运算表或方案管理器；方案摘要属于该缺失流程。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "单变量模拟运算表"
      ],
      "id": "excel-676",
      "query": "one.*variable.*table",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:130"
      ],
      "note": "官方明确未提供内置 Goal Seek、单/双变量模拟运算表或方案管理器；方案摘要属于该缺失流程。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "双变量模拟运算表"
      ],
      "id": "excel-677",
      "query": "two.*variable.*table",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:130"
      ],
      "note": "官方明确未提供内置 Goal Seek、单/双变量模拟运算表或方案管理器；方案摘要属于该缺失流程。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "方案管理器"
      ],
      "id": "excel-678",
      "query": "scenario.*manager",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:130"
      ],
      "note": "官方明确未提供内置 Goal Seek、单/双变量模拟运算表或方案管理器；方案摘要属于该缺失流程。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "方案摘要"
      ],
      "id": "excel-679",
      "query": "scenario.*summary",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:130"
      ],
      "note": "官方明确未提供内置 Goal Seek、单/双变量模拟运算表或方案管理器；方案摘要属于该缺失流程。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "规划求解 Solver"
      ],
      "id": "excel-680",
      "query": "solver",
      "matchedFiles": 74,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/rotate-enabled.ts",
        "packages/docs-find-replace/src/models/docs-find.model.ts",
        "packages/docs-find-replace/src/models/__tests__/docs-find.model.spec.ts",
        "packages/docs-find-replace/src/services/__tests__/docs-find-replace.provider.spec.ts",
        "packages/drawing/src/index.ts",
        "packages/drawing/src/utils/rotate-enabled.ts",
        "packages/sheets/src/controllers/__tests__/formula/create-function-test-bed.ts",
        "packages/docs-ui/src/__tests__/embed-docs-custom-block-refresh.spec.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "目标与变量约束"
      ],
      "id": "excel-681",
      "query": "variable.*constraint",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "假设分析与专业分析",
        "假设分析",
        "求解方法与结果报告"
      ],
      "id": "excel-682",
      "query": "solver.*method",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "描述统计"
      ],
      "id": "excel-684",
      "query": "descriptive.*statistic",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "直方图分析"
      ],
      "id": "excel-685",
      "query": "histogram",
      "matchedFiles": 9,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/basics/range-merge.ts",
        "content/docs/features/charts.mdx",
        "content/docs/features/sheets.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/sheets/features/charts.mdx",
        "content/reference/facade/enums.mdx",
        "content/reference/facade/index.mdx",
        "content/reference/facade/histogram-chart-builder.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "相关系数分析"
      ],
      "id": "excel-686",
      "query": "correlation",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/statistical/en-US.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "协方差分析"
      ],
      "id": "excel-687",
      "query": "covariance",
      "matchedFiles": 28,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/compatibility/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/en-US.ts",
        "packages/engine-formula/src/locale/function-list/statistical/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/statistical/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/statistical/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/statistical/ko-KR.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "回归分析"
      ],
      "id": "excel-688",
      "query": "regression",
      "matchedFiles": 26,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/notification/Notification.stories.tsx",
        "packages/design/src/components/message/Message.stories.tsx",
        "packages/sheets/src/services/auto-fill/__tests__/tool.spec.ts",
        "packages/core/src/shared/__tests__/numfmt.spec.ts",
        "packages/core/src/docs/data-model/__tests__/replacement.spec.ts",
        "packages/docs-ui/src/locale/__tests__/page-settings-locale.spec.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/back-scroll.render-controller.spec.ts",
        "packages/docs-ui/src/services/editor/__tests__/editor-manager.service.spec.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "方差分析"
      ],
      "id": "excel-689",
      "query": "anova|analysis.*variance",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "t 检验"
      ],
      "id": "excel-690",
      "query": "t.?test",
      "matchedFiles": 1017,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/__tests__/create-test-bed.ts",
        "packages/find-replace/src/commands/operations/__tests__/find-replace.operation.spec.ts",
        "packages/find-replace/src/commands/commands/__tests__/replace.command.spec.ts",
        "packages/find-replace/src/controllers/__tests__/find-replace.shortcut.spec.ts",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts",
        "packages/ui/src/views/object-permission/__tests__/ObjectPermissionPanel.spec.tsx",
        "packages/ui/src/views/object-permission/__tests__/ObjectPermissionButton.spec.tsx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "z 检验"
      ],
      "id": "excel-691",
      "query": "z.?test",
      "matchedFiles": 51,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/controllers/render-controllers/mobile/__tests__/mobile-header-resize.render-controller.spec.ts",
        "packages/sheets-ui/src/services/editor/__tests__/cell-editor-resize.service.spec.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/ko-KR.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "F 检验"
      ],
      "id": "excel-692",
      "query": "f.?test",
      "matchedFiles": 54,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/sheets/worksheet.ts",
        "packages/core/src/shared/name.ts",
        "packages/docs-ui/src/services/selection/__tests__/doc-selection-render.service.spec.ts",
        "packages/action-recorder/src/services/__tests__/replay.service.spec.ts",
        "packages/sheets-formula/src/controllers/__tests__/update-formula.controller.spec.ts",
        "packages/sheets-drawing-ui/src/services/__tests__/canvas-float-dom-manager.service.spec.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/pt-BR.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "移动平均"
      ],
      "id": "excel-693",
      "query": "moving.*average",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "指数平滑"
      ],
      "id": "excel-694",
      "query": "exponential.*smooth",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/statistical/de-DE.ts",
        "packages/engine-formula/src/locale/function-list/statistical/en-US.ts",
        "packages/engine-formula/src/functions/statistical/forecast-ets/index.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "随机数生成"
      ],
      "id": "excel-695",
      "query": "random",
      "matchedFiles": 186,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/commands/operations/drawing-group.operation.ts",
        "packages/ui/src/mobile-plugin.ts",
        "packages/ui/src/plugin.ts",
        "packages/ui/src/locale/zh-TW.ts",
        "packages/ui/src/locale/pt-BR.ts",
        "packages/ui/src/locale/fa-IR.ts",
        "packages/ui/src/locale/fr-FR.ts",
        "packages/ui/src/locale/ca-ES.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "抽样"
      ],
      "id": "excel-696",
      "query": "sampling|sample",
      "matchedFiles": 86,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/services/format-painter/format-painter-session.service.ts",
        "packages/ui/src/services/format-painter/__tests__/format-painter-session.service.spec.ts",
        "packages/core/src/sheets/__tests__/clone-worksheet-data.spec.ts",
        "packages/docs-ui/src/basics/paragraph.ts",
        "packages/docs-ui/src/commands/commands/__tests__/format-painter.command.spec.ts",
        "packages/docs-ui/src/controllers/render-controllers/mobile/doc-selection-render.controller.ts",
        "packages/docs-ui/src/services/clipboard/__tests__/html-and-udm-convert.spec.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/mobile-scroll.render-controller.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "分析工具库",
        "傅里叶分析"
      ],
      "id": "excel-697",
      "query": "fourier|fft",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/controllers/render-controllers/doc.render-controller.ts",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/utils/slide-tab-bar.ts",
        "packages/sheets-ui/src/views/permission/panel-list/constant.ts",
        "packages/sheets-ui/src/views/permission/user-dialog/constant.ts",
        "packages/thread-comment-ui/src/locale/de-DE.ts",
        "packages/engine-render/src/components/sheets/spreadsheet.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "预测",
        "预测工作表（Windows）"
      ],
      "id": "excel-699",
      "query": "forecast.*sheet",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/shared/history.mdx"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "预测",
        "预测置信区间"
      ],
      "id": "excel-700",
      "query": "confidence",
      "matchedFiles": 48,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/compatibility/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/compatibility/ar-SA.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "预测",
        "季节性设置"
      ],
      "id": "excel-701",
      "query": "seasonality",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/statistical/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/statistical/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/ca-ES.ts",
        "packages/engine-formula/src/locale/function-list/statistical/zh-CN.ts",
        "packages/engine-formula/src/locale/function-list/statistical/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/statistical/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/statistical/ar-SA.ts"
      ]
    },
    {
      "path": [
        "假设分析与专业分析",
        "预测",
        "时间线与数据范围设置"
      ],
      "id": "excel-702",
      "query": "forecast.*(timeline|range)",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 分析工具/交互流程的直接实现；存在相似统计公式或图表不代表工具库、规划求解或预测工作表已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/functions/statistical/forecast-ets/index.ts",
        "packages/engine-formula/src/services/formula/function-list/statistical.ts",
        "content/docs/features/shared/comments.mdx",
        "content/docs/features/shared/history.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "图片压缩"
      ],
      "id": "excel-710",
      "query": "compress.*image|image.*compress",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "背景删除"
      ],
      "id": "excel-711",
      "query": "remove.*background",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-drawing/src/facade/f-worksheet.ts",
        "packages/sheets-ui/src/views/sheet-bar/sheet-bar-tabs/utils/slide-tab-bar.ts",
        "content/docs/features/pdf.mdx",
        "content/guides/sheets/features/images.mdx",
        "content/guides/slides/features/core/slides-and-layouts.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "图标"
      ],
      "id": "excel-713",
      "query": "insert.*icon",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/context-menu/__tests__/ContextMenuPanel.spec.tsx",
        "packages/ui/src/views/components/ribbon/ribbon-menu/DefaultMenu.tsx",
        "packages/sheets-thread-comment-ui/src/menu/menu.ts",
        "packages/sheets-thread-comment-ui/src/menu/mobile-menu.ts",
        "packages/sheets-thread-comment-ui/src/controllers/components.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/mobile/components.controller.ts",
        "packages/docs-ui/src/menu/paragraph-menu.ts",
        "packages/docs-ui/src/menu/context-menu.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "SmartArt"
      ],
      "id": "excel-714",
      "query": "smartart",
      "matchedFiles": 34,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/shape.mdx",
        "audit/content/reference/facade/slide.mdx"
      ],
      "note": "共享 FShape 有 SmartArt 数据与节点编辑方法；明确插入入口在 Slides，未确认 Sheets 中插入/编辑 SmartArt 的完整接入与导入兼容。",
      "candidateFiles": [
        "packages/drawing-ui/src/locale/zh-TW.ts",
        "packages/drawing-ui/src/locale/pt-BR.ts",
        "packages/drawing-ui/src/locale/fa-IR.ts",
        "packages/drawing-ui/src/locale/fr-FR.ts",
        "packages/drawing-ui/src/locale/ca-ES.ts",
        "packages/drawing-ui/src/locale/zh-CN.ts",
        "packages/drawing-ui/src/locale/ko-KR.ts",
        "packages/drawing-ui/src/locale/vi-VN.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "文本框"
      ],
      "id": "excel-715",
      "query": "textBox|text.*box",
      "matchedFiles": 82,
      "state": "pro",
      "sources": [
        "audit/content/docs/features/sheets.mdx:44",
        "audit/content/reference/facade/shape-text.mdx"
      ],
      "note": "官方明确列出 Shapes, text boxes, arrows, and connectors 支持；需 Pro 形状模块。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/ui/src/views/emoji-picker/__tests__/EmojiPicker.spec.tsx",
        "packages/ui/src/views/slider/__tests__/Slider.spec.tsx",
        "packages/ui/src/views/object-permission/__tests__/ObjectPermissionButton.spec.tsx",
        "packages/ui/src/views/components/context-menu/__tests__/AnchoredContextMenu.spec.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/RibbonOverflow.spec.tsx",
        "packages/ui/src/views/components/ribbon/__tests__/TooltipButtonWrapper.spec.tsx",
        "packages/ui/src/views/components/dialog-part/__tests__/DialogPart.spec.tsx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "艺术字"
      ],
      "id": "excel-716",
      "query": "wordart",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "图像与形状",
        "屏幕截图"
      ],
      "id": "excel-717",
      "query": "screenshot",
      "matchedFiles": 29,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/print.mdx:267"
      ],
      "note": "Pro 可获取所选表格区域截图；不是 Office“可用窗口/屏幕剪辑”捕获系统桌面。",
      "candidateFiles": [
        "packages/sheets-drawing-ui/src/controllers/__tests__/sheet-drawing-update.controller.spec.ts",
        "content/docs/index.mdx",
        "content/docs/features/slides.mdx",
        "content/docs/features/shared/themes-and-locales.mdx",
        "content/docs/features/shared/comments.mdx",
        "content/docs/features/shared/server-calculation.mdx",
        "content/docs/features/shared/binding.mdx",
        "content/docs/features/shared/visual-inspection.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "对象布局",
        "对象选择窗格"
      ],
      "id": "excel-719",
      "query": "selection.*pane",
      "matchedFiles": 11,
      "state": "partial",
      "sources": [
        "audit/packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "audit/content/guides/sheets/features/core/index.mdx"
      ],
      "note": "有 Layers/Object List 界面及工作表打开形状图层命令，支持选择和层级操作；形状面板属于 Pro 集成范围，不等于 Excel 全部对象类型。",
      "candidateFiles": [
        "packages/sheets-thread-comment-ui/src/views/SheetsThreadCommentPanel.tsx",
        "packages/docs-ui/src/commands/commands/clipboard.inner.command.ts",
        "packages/sheets-ui/src/services/mark-selection/mark-selection.service.ts",
        "packages/sheets-ui/src/services/permission/sheet-permission-user-list.service.ts",
        "packages/sheets-formula-ui/src/views/mobile/formula-editor/MobileFormulaEditor.tsx",
        "content/docs/features/shared/customization.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/bases/features/core/bases-api.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "对象布局",
        "组合与取消组合"
      ],
      "id": "excel-721",
      "query": "ungroup|group.*drawing|group.*shape",
      "matchedFiles": 121,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-drawing/src/facade/f-worksheet.ts",
        "audit/content/reference/facade/worksheet.mdx"
      ],
      "note": "FWorksheet.groupDrawings/ungroupDrawings 支持工作表绘图分组及解组。",
      "candidateFiles": [
        "packages/drawing-ui/src/locale/zh-TW.ts",
        "packages/drawing-ui/src/locale/pt-BR.ts",
        "packages/drawing-ui/src/locale/fa-IR.ts",
        "packages/drawing-ui/src/locale/fr-FR.ts",
        "packages/drawing-ui/src/locale/ca-ES.ts",
        "packages/drawing-ui/src/locale/zh-CN.ts",
        "packages/drawing-ui/src/locale/ko-KR.ts",
        "packages/drawing-ui/src/locale/vi-VN.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "对象布局",
        "对象替代文字"
      ],
      "id": "excel-725",
      "query": "altText|alternative.*text",
      "matchedFiles": 30,
      "state": "partial",
      "sources": [
        "audit/packages/engine-formula/src/functions/lookup/image/index.ts",
        "audit/packages/sheets-formula/src/controllers/image-formula-cell-interceptor.controller.ts"
      ],
      "note": "IMAGE 公式有 altText 参数；尚未确认浮动图片/形状统一替代文字编辑及屏幕阅读器呈现。",
      "candidateFiles": [
        "packages/sheets-formula/src/controllers/image-formula-cell-interceptor.controller.ts",
        "packages/sheets-formula/src/controllers/__tests__/image-formula-cell-interceptor.controller.spec.ts",
        "packages/engine-formula/src/locale/function-list/cube/de-DE.ts",
        "packages/engine-formula/src/locale/function-list/cube/en-US.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "对象布局",
        "链接与操作"
      ],
      "id": "excel-726",
      "query": "hyperlink|hyperLink|action",
      "matchedFiles": 1074,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/controllers/__tests__/find-replace.shortcut.spec.ts",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceBar.tsx",
        "packages/drawing-ui/src/commands/operations/__tests__/drawing-arrange-group.operation.spec.ts",
        "packages/drawing-ui/src/controllers/mobile/ui.controller.ts",
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/image-popup-menu/MobileImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/panel/MobileImageCropper.tsx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "公式与符号"
      ],
      "id": "excel-729",
      "query": "equation|symbol",
      "matchedFiles": 237,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/config/config.ts",
        "packages/drawing-ui/src/locale/sk-SK.ts",
        "packages/drawing-ui/src/locale/pl-PL.ts",
        "packages/drawing-ui/src/config/config.ts",
        "packages/ui/src/locale/zh-TW.ts",
        "packages/ui/src/locale/pt-BR.ts",
        "packages/ui/src/locale/fa-IR.ts",
        "packages/ui/src/locale/fr-FR.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "页眉页脚图片"
      ],
      "id": "excel-730",
      "query": "header.*image|footer.*image",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/__tests__/drawing-update.controller.spec.ts",
        "packages/drawing-ui/src/services/drawing-render.service.ts",
        "packages/docs-drawing-ui/src/utils/__tests__/drawing-wrapping-position.spec.ts",
        "packages/docs-drawing-ui/src/controllers/doc-drawing-transformer-update.controller.ts",
        "packages/docs-drawing-ui/src/controllers/render-controllers/doc-drawing-update.render-controller.ts",
        "packages/docs-drawing-ui/src/controllers/render-controllers/__tests__/doc-drawing-transform-update.controller.spec.ts",
        "packages/docs-drawing-ui/src/controllers/__tests__/doc-drawing-printing.controller.spec.ts",
        "packages/docs-drawing/src/facade/__tests__/f-document-image.spec.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "嵌入与链接 OLE 对象（平台相关）"
      ],
      "id": "excel-731",
      "query": "\\bole\\b",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "签名行（Windows）"
      ],
      "id": "excel-732",
      "query": "signature.*line",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/docs.mdx",
        "content/reference/facade/sheet-timeline.mdx"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "墨迹绘制"
      ],
      "id": "excel-733",
      "query": "ink|freehand",
      "matchedFiles": 948,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/drawing-ui/src/locale/de-DE.ts",
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "packages/drawing-ui/src/views/object-list-panel/MobileObjectListPanel.tsx",
        "packages/drawing-ui/src/views/__tests__/DrawingGroupBehavior.spec.tsx",
        "packages/ui/src/locale/id-ID.ts",
        "packages/ui/src/facade/f-menu-builder.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "笔与荧光笔"
      ],
      "id": "excel-734",
      "query": "highlighter|pen",
      "matchedFiles": 1989,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/package.json",
        "packages/find-replace/src/mobile-plugin.ts",
        "packages/find-replace/src/plugin.ts",
        "packages/find-replace/src/index.ts",
        "packages/find-replace/src/locale/zh-TW.ts",
        "packages/find-replace/src/locale/pt-BR.ts",
        "packages/find-replace/src/locale/fa-IR.ts",
        "packages/find-replace/src/locale/fr-FR.ts"
      ]
    },
    {
      "path": [
        "插入对象与绘图",
        "其他对象",
        "墨迹转形状"
      ],
      "id": "excel-735",
      "query": "ink.*shape",
      "matchedFiles": 14,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/slides/src/views/render/adaptors/shape-adaptor.ts",
        "packages/sheets-conditional-formatting/src/models/icon-map.ts",
        "content/docs/features/slides.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/boards/ui/overview.mdx",
        "content/guides/boards/features/core/index.mdx",
        "content/guides/boards/getting-started/quickstart.mdx",
        "content/guides/boards/getting-started/installation/index.mdx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "页面布局视图"
      ],
      "id": "excel-739",
      "query": "page.*layout",
      "matchedFiles": 125,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/docs-ui/src/mobile-plugin.ts",
        "packages/docs-ui/src/plugin.ts",
        "packages/docs-ui/src/index.ts",
        "packages/docs-ui/src/facade/__tests__/f-document.spec.ts",
        "packages/docs-ui/src/components/doc-page-render-component.ts",
        "packages/docs-ui/src/commands/commands/doc-page-setup.command.ts",
        "packages/docs-ui/src/commands/commands/__tests__/misc.command.spec.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "分页预览"
      ],
      "id": "excel-740",
      "query": "page.*break",
      "matchedFiles": 65,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/data-model/document-data-model.ts",
        "packages/core/src/docs/data-model/types.ts",
        "packages/core/src/docs/data-model/document-statistics.ts",
        "packages/core/src/docs/data-model/__tests__/paragraph-style.spec.ts",
        "packages/core/src/docs/data-model/__tests__/document-modeling.integration.spec.ts",
        "packages/core/src/docs/data-model/text-x/utils.ts",
        "packages/core/src/docs/data-model/text-x/apply-utils/insert-apply.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "显示隐藏标题"
      ],
      "id": "excel-742",
      "query": "rowHeader|columnHeader",
      "matchedFiles": 134,
      "state": "oss",
      "sources": [
        "audit/packages/core/src/sheets/typedef.ts:165",
        "audit/packages/engine-render/src/components/sheets/sheet.render-skeleton.ts"
      ],
      "note": "工作表模型提供 rowHeader/columnHeader 尺寸及 hidden，渲染器读取标题配置。",
      "candidateFiles": [
        "packages/ui/src/services/menu/types.ts",
        "packages/sheets-drawing/src/basics/transform-position.ts",
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts",
        "packages/sheets/src/basics/selection.ts",
        "packages/sheets/src/basics/sheet-header.ts",
        "packages/sheets/src/basics/__tests__/expand.data.ts",
        "packages/sheets/src/models/range-themes/build-in-theme.factory.ts",
        "packages/sheets/src/commands/mutations/__tests__/create-command-test-bed.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "显示隐藏编辑栏"
      ],
      "id": "excel-743",
      "query": "formulaBar",
      "matchedFiles": 20,
      "state": "oss",
      "sources": [
        "audit/content/guides/sheets/features/core/index.mdx:334"
      ],
      "note": "Sheets UI 配置 formulaBar 可控制编辑栏显示；不含 Excel 功能区选项卡。",
      "candidateFiles": [
        "packages/core/src/services/undoredo/__tests__/undoredo.service.spec.ts",
        "packages/sheets-ui/src/index.ts",
        "packages/sheets-ui/src/config/config.ts",
        "packages/sheets-ui/src/controllers/mobile/ui-mobile.controller.ts",
        "packages/sheets-ui/src/controllers/editor/formula-editor.controller.ts",
        "packages/sheets-ui/src/controllers/editor/data-sync.controller.ts",
        "packages/sheets-ui/src/controllers/editor/editing.render-controller.ts",
        "packages/sheets-ui/src/controllers/editor/__tests__/data-sync.controller.spec.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "缩放到选定区域"
      ],
      "id": "excel-745",
      "query": "zoom.*selection|selection.*zoom",
      "matchedFiles": 23,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/menu/display.menu.ts",
        "packages/docs-ui/src/controllers/render-controllers/zoom.render-controller.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/doc-selection-render.controller.spec.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/zoom.render-controller.spec.ts",
        "packages/docs-ui/src/services/selection/doc-selection-render.service.ts",
        "packages/sheets-ui/src/menu/zoom.menu.ts",
        "packages/sheets-ui/src/controllers/render-controllers/editor-bridge.render-controller.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/mobile-header-resize.render-controller.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "工作表视图",
        "自定义视图（有限制）"
      ],
      "id": "excel-746",
      "query": "custom.*view",
      "matchedFiles": 67,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/dom/FloatDom.tsx",
        "packages/ui/src/views/components/dom/__tests__/FloatDom.spec.tsx",
        "packages/sheets-numfmt-ui/src/controllers/mobile/components.controller.ts",
        "packages/sheets-sort-ui/src/controllers/components.controller.ts",
        "packages/sheets-sort-ui/src/controllers/mobile/components.controller.ts",
        "packages/core/src/bases/typedef.ts",
        "packages/docs-ui/src/embed-host-anchor.ts",
        "packages/docs-ui/src/embed-docs-custom-block-bleed.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "拆分窗口"
      ],
      "id": "excel-752",
      "query": "split.*window|split.*pane",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/basics/__tests__/viewport-subtract.spec.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "新建窗口"
      ],
      "id": "excel-753",
      "query": "new.*window",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/facade/f-univer.ts",
        "packages/docs-ui/src/controllers/render-controllers/__tests__/doc-editor-bridge.controller.spec.ts",
        "packages/sheets-hyper-link-ui/src/views/MobileCellLinkPopup.tsx",
        "packages/sheets-hyper-link-ui/src/views/CellLinkPopup.tsx",
        "content/guides/sheets/features/collaboration.mdx",
        "content/guides/bases/features/collaboration.mdx",
        "content/guides/docs/features/collaboration.mdx",
        "content/guides/slides/features/collaboration.mdx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "重排窗口"
      ],
      "id": "excel-754",
      "query": "arrange.*window",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "并排查看"
      ],
      "id": "excel-755",
      "query": "side.*by.*side",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/collaboration/database-adapters.mdx",
        "content/docs/get-started.mdx",
        "content/docs/features/charts.mdx",
        "content/blog/doc-typesetting-design.mdx",
        "content/guides/sheets/index.mdx",
        "content/guides/bases/index.mdx",
        "content/guides/docs/index.mdx",
        "content/guides/slides/index.mdx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "同步滚动"
      ],
      "id": "excel-756",
      "query": "sync.*scroll",
      "matchedFiles": 10,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/controllers/render-controllers/__tests__/back-scroll.render-controller.spec.ts",
        "packages/sheets-ui/src/commands/commands/set-scroll.command.ts",
        "packages/sheets-ui/src/controllers/render-controllers/scroll.render-controller.ts",
        "packages/sheets-ui/src/controllers/render-controllers/__tests__/freeze.render-controller.spec.ts",
        "packages/sheets-ui/src/controllers/render-controllers/__tests__/scroll.render-controller.spec.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/mobile-scroll.render-controller.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/__tests__/mobile-scroll.render-controller.spec.ts",
        "packages/sheets-ui/src/controllers/editor/editing.render-controller.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "隐藏取消隐藏窗口"
      ],
      "id": "excel-757",
      "query": "hide.*window",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/views/components/mobile-zoom-indicator/mobile-zoom-indicator.ts",
        "packages/docs-ui/src/views/ParagraphMenu.tsx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "窗口",
        "切换窗口"
      ],
      "id": "excel-758",
      "query": "switch.*window",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/guides/sheets/getting-started/installation/index.mdx",
        "content/guides/docs/getting-started/installation/index.mdx",
        "content/guides/slides/getting-started/installation/index.mdx",
        "content/guides/boards/getting-started/installation/index.mdx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "阅读辅助",
        "状态栏汇总"
      ],
      "id": "excel-760",
      "query": "StatusBar",
      "matchedFiles": 32,
      "state": "oss",
      "sources": [
        "audit/packages/sheets-ui/src/services/status-bar.service.ts"
      ],
      "note": "选区状态栏包含 SUM/COUNT/COUNTA/AVERAGE/MIN/MAX，按有效数据计算。",
      "candidateFiles": [
        "packages/sheets-ui/src/mobile-plugin.ts",
        "packages/sheets-ui/src/plugin.ts",
        "packages/sheets-ui/src/index.ts",
        "packages/sheets-ui/src/locale/zh-TW.ts",
        "packages/sheets-ui/src/locale/pt-BR.ts",
        "packages/sheets-ui/src/locale/fa-IR.ts",
        "packages/sheets-ui/src/locale/fr-FR.ts",
        "packages/sheets-ui/src/locale/ca-ES.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "阅读辅助",
        "状态栏自定义"
      ],
      "id": "excel-761",
      "query": "StatusBar",
      "matchedFiles": 32,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-ui/src/services/status-bar.service.ts",
        "audit/packages/sheets-ui/src/views/status-bar/StatusBar.tsx"
      ],
      "note": "可通过服务 addFunctions 增加统计项，界面可切换统计值；未覆盖 Excel 全部状态栏开关。",
      "candidateFiles": [
        "packages/sheets-ui/src/mobile-plugin.ts",
        "packages/sheets-ui/src/plugin.ts",
        "packages/sheets-ui/src/index.ts",
        "packages/sheets-ui/src/locale/zh-TW.ts",
        "packages/sheets-ui/src/locale/pt-BR.ts",
        "packages/sheets-ui/src/locale/fa-IR.ts",
        "packages/sheets-ui/src/locale/fr-FR.ts",
        "packages/sheets-ui/src/locale/ca-ES.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "阅读辅助",
        "导航窗格（版本相关）"
      ],
      "id": "excel-762",
      "query": "navigation.*pane",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/bases/ui/overview.mdx",
        "content/guides/docs/features/table-of-contents.mdx",
        "content/reference/packages/plugins/univerjs/docs-toc.mdx"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "阅读辅助",
        "工作表视图 Sheet Views（云端条件）"
      ],
      "id": "excel-764",
      "query": "sheet.*view",
      "matchedFiles": 274,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:61"
      ],
      "note": "官方明确不支持相互独立、不影响其他协作者的筛选/排序视图。",
      "candidateFiles": [
        "packages/sheets-thread-comment-ui/src/menu/menu.ts",
        "packages/sheets-thread-comment-ui/src/menu/mobile-menu.ts",
        "packages/sheets-thread-comment-ui/src/controllers/components.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-hover.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-popup.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/sheets-thread-comment-permission.controller.ts",
        "packages/sheets-thread-comment-ui/src/controllers/mobile/components.controller.ts",
        "packages/sheets-numfmt-ui/src/controllers/ui.controller.ts"
      ]
    },
    {
      "path": [
        "视图、窗口与阅读",
        "阅读辅助",
        "查找帮助与命令搜索"
      ],
      "id": "excel-765",
      "query": "command.*search|search.*command",
      "matchedFiles": 25,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/univer.mdx"
      ],
      "note": "可读取/执行命令并扩展 UI；未见 Excel Tell Me/Search 式统一帮助和命令搜索成品。",
      "candidateFiles": [
        "packages/drawing-ui/src/controllers/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/image-cropper.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/image-cropper.controller.ts",
        "packages/ui/src/menu/schema.ts",
        "packages/ui/src/menu/feature-search.menu.ts",
        "packages/ui/src/controllers/feature-search/feature-search.controller.ts",
        "packages/ui/src/controllers/__tests__/ui.controller.spec.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "页面布局",
        "首页不同"
      ],
      "id": "excel-774",
      "query": "different.*first|first.*page",
      "matchedFiles": 136,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/design/src/components/pager/__tests__/index.spec.tsx",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/section-header-footer.ts",
        "packages/core/src/docs/data-model/empty-snapshot.ts",
        "packages/core/src/services/permission/__tests__/object-permission.service.spec.ts",
        "packages/docs-ui/src/basics/table.ts",
        "packages/docs-ui/src/locale/zh-TW.ts",
        "packages/docs-ui/src/locale/pt-BR.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "页面布局",
        "奇偶页不同"
      ],
      "id": "excel-775",
      "query": "odd.*even|even.*odd",
      "matchedFiles": 55,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/models/zebra-crossing-cache.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/data-model/empty-snapshot.ts",
        "packages/docs-ui/src/locale/zh-TW.ts",
        "packages/docs-ui/src/locale/pt-BR.ts",
        "packages/docs-ui/src/locale/fa-IR.ts",
        "packages/docs-ui/src/locale/fr-FR.ts",
        "packages/docs-ui/src/locale/ca-ES.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "页面布局",
        "清除打印区域"
      ],
      "id": "excel-778",
      "query": "clear.*print.*area",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "手动分页符"
      ],
      "id": "excel-780",
      "query": "page.*break",
      "matchedFiles": 65,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/data-model/document-data-model.ts",
        "packages/core/src/docs/data-model/types.ts",
        "packages/core/src/docs/data-model/document-statistics.ts",
        "packages/core/src/docs/data-model/__tests__/paragraph-style.spec.ts",
        "packages/core/src/docs/data-model/__tests__/document-modeling.integration.spec.ts",
        "packages/core/src/docs/data-model/text-x/utils.ts",
        "packages/core/src/docs/data-model/text-x/apply-utils/insert-apply.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "重置分页符"
      ],
      "id": "excel-781",
      "query": "reset.*break",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-render/src/components/docs/layout/doc-simple-skeleton.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "缩放打印比例"
      ],
      "id": "excel-782",
      "query": "PrintScale",
      "matchedFiles": 3,
      "state": "pro",
      "sources": [
        "audit/content/reference/facade/workbook.mdx",
        "audit/print-types-1.2.0"
      ],
      "note": "ISheetPrintLayoutConfig 提供 scale 与 customScale 百分比；需 Pro 打印插件。",
      "candidateFiles": [
        "content/guides/sheets/features/print.mdx",
        "content/reference/facade/enums.mdx",
        "content/reference/facade/workbook.mdx"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "打印行列标题"
      ],
      "id": "excel-787",
      "query": "print.*header",
      "matchedFiles": 7,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-drawing-ui/src/controllers/__tests__/doc-drawing-printing.controller.spec.ts",
        "packages/sheets-drawing-ui/src/views/PrintingFloatDom.tsx",
        "packages/engine-render/src/components/sheets/extensions/column-header-layout.ts",
        "content/blog/univer-1-0.mdx",
        "content/guides/sheets/features/print.mdx",
        "content/reference/facade/enums.mdx",
        "content/reference/facade/workbook.mdx"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "打印顺序"
      ],
      "id": "excel-788",
      "query": "print.*order",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/slides/features/print.mdx",
        "content/reference/facade/univer.mdx"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "分页与缩放",
        "黑白与草稿质量"
      ],
      "id": "excel-789",
      "query": "draft|monochrome",
      "matchedFiles": 84,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts",
        "packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "packages/drawing-ui/src/views/object-list-panel/MobileObjectListPanel.tsx",
        "packages/ui/src/views/object-permission/__tests__/ObjectPermissionButton.spec.tsx",
        "packages/ui/src/views/components/context-menu/__tests__/AnchoredContextMenu.spec.tsx",
        "packages/ui/src/views/components/dialog-part/__tests__/DialogPart.spec.tsx",
        "packages/ui/src/views/font-size/FontSize.tsx",
        "packages/ui/src/views/font-size/__tests__/FontSize.spec.tsx"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "打印输出",
        "页码范围"
      ],
      "id": "excel-795",
      "query": "page.*range",
      "matchedFiles": 47,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/print.mdx"
      ],
      "note": "由浏览器/系统打印对话框提供页码、份数等选项，能力取决于浏览器与打印目标；不是 Univer 布局配置里的独立参数。",
      "candidateFiles": [
        "packages/design/src/components/dialog/__tests__/MobileDialog.spec.tsx",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/body-structure-validator.spec.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/text-x.spec.ts",
        "packages/docs-toc/src/commands/table-of-contents.command.ts",
        "packages/docs-toc/src/commands/__tests__/table-of-contents.command.spec.ts",
        "packages/docs-ui/src/commands/commands/doc-delete.command.ts",
        "packages/docs-ui/src/commands/commands/__tests__/insert-header-footer-field.command.spec.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "打印输出",
        "份数与逐份打印"
      ],
      "id": "excel-796",
      "query": "collate|copies",
      "matchedFiles": 45,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/print.mdx"
      ],
      "note": "由浏览器/系统打印对话框提供页码、份数等选项，能力取决于浏览器与打印目标；不是 Univer 布局配置里的独立参数。",
      "candidateFiles": [
        "packages/sheets-drawing/src/commands/commands/__tests__/sheet-drawing.integration.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/insert-remove-rows-cols.command.spec.ts",
        "packages/sheets/src/commands/commands/__tests__/auto-fill.command.spec.ts",
        "packages/sheets/src/controllers/__tests__/auto-fill.controller.spec.ts",
        "packages/core/src/types/enum/auto-fill-series.ts",
        "packages/docs-ui/src/commands/commands/__tests__/clipboard.inner.command.spec.ts",
        "packages/docs-ui/src/commands/commands/__tests__/format-painter.command.spec.ts",
        "packages/docs-ui/src/commands/commands/__tests__/clipboard.command.spec.ts"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "打印输出",
        "批注备注打印"
      ],
      "id": "excel-797",
      "query": "print.*comment|print.*note",
      "matchedFiles": 14,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-ui/src/services/__tests__/doc-print-interceptor.service.spec.ts",
        "packages/docs/src/facade/f-document.ts",
        "packages/docs/src/facade/f-document-permission.ts",
        "content/docs/features/slides.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/slides/features/print.mdx",
        "content/guides/slides/features/core/permissions.mdx",
        "content/reference/facade/presentation.mdx"
      ]
    },
    {
      "path": [
        "页面设置、打印与发布",
        "打印输出",
        "错误单元格打印方式"
      ],
      "id": "excel-798",
      "query": "print.*error",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "页面设置、打印与发布",
        "打印输出",
        "发布为网页（传统桌面功能）"
      ],
      "id": "excel-800",
      "query": "publish.*html|export.*html",
      "matchedFiles": 63,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/ui/src/utils/html.ts",
        "packages/ui/src/utils/cell.ts",
        "packages/ui/src/utils/index.ts",
        "packages/ui/src/common/lifecycle.ts",
        "packages/ui/src/views/mobile-workbench/MobileCanvasLayout.tsx",
        "packages/ui/src/views/hooks/prevent-browser-zoom.ts",
        "packages/ui/src/views/hooks/use-click-out-side.ts"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "批注与备注",
        "@提及协作者"
      ],
      "id": "excel-805",
      "query": "mention",
      "matchedFiles": 46,
      "state": "partial",
      "sources": [
        "audit/packages/thread-comment-ui/src/views/thread-comment-editor/util.ts",
        "audit/content/guides/sheets/features/comments.mdx"
      ],
      "note": "开源评论文本包含 mention 结构及编辑器支持；用户目录、远端评论同步和通知需宿主/Pro 服务，不意味着开源自带通知系统。",
      "candidateFiles": [
        "packages/docs-find-replace/src/commands/commands/__tests__/docs-replace.command.spec.ts",
        "packages/docs-find-replace/src/controllers/__tests__/utils.spec.ts",
        "packages/core/src/univer.ts",
        "packages/core/src/index.ts",
        "packages/core/src/types/enum/mention-type.ts",
        "packages/core/src/types/enum/index.ts",
        "packages/core/src/types/interfaces/i-mention.ts",
        "packages/core/src/types/interfaces/index.ts"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "批注与备注",
        "遍历批注备注"
      ],
      "id": "excel-810",
      "query": "getComments|next.*comment",
      "matchedFiles": 42,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/comments.mdx",
        "audit/content/guides/sheets/features/notes.mdx"
      ],
      "note": "评论与备注可列举/按范围读取；未确认 Office 统一“上一条/下一条”遍历操作覆盖两类对象。",
      "candidateFiles": [
        "packages/docs-thread-comment-ui/src/commands/commands/__tests__/add-doc-comment.command.spec.ts",
        "packages/docs-thread-comment-ui/src/controllers/render-controllers/__tests__/render.controller.spec.ts",
        "packages/docs-thread-comment-ui/src/views/DocThreadCommentPanel.tsx",
        "packages/docs-thread-comment-ui/src/services/doc-thread-comment.service.ts",
        "packages/docs-thread-comment/src/facade/f-document-text-range.ts",
        "packages/docs-thread-comment/src/commands/commands/__tests__/create-doc-text-range-comment.command.spec.ts",
        "packages/thread-comment-ui/src/services/thread-comment-panel.service.ts",
        "packages/thread-comment/src/facade/f-univer.ts"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "协同",
        "共享链接"
      ],
      "id": "excel-812",
      "query": "share.*link",
      "matchedFiles": 7,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/locale/en-US.ts",
        "content/docs/features/sheets.mdx",
        "content/docs/features/relational-table.mdx",
        "content/docs/examples/openclaw.mdx",
        "content/docs/examples/workspace.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/sheets/features/pivot-chart.mdx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "协同",
        "指定人员访问"
      ],
      "id": "excel-813",
      "query": "share.*permission|specific.*people",
      "matchedFiles": 47,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/shared/permissions.mdx",
        "audit/content/server/collaboration/extensions.mdx"
      ],
      "note": "协作服务可绑定身份并限制访问，须宿主接入认证/授权；不是开源即用的 Excel 共享邀请或指定人员链接界面。",
      "candidateFiles": [
        "packages/ui/src/controllers/error/__tests__/error.controller.spec.ts",
        "packages/sheets/src/index.ts",
        "packages/sheets/src/facade/permission/permission-types.ts",
        "packages/sheets/src/facade/permission/permission-point-map.ts",
        "packages/sheets/src/services/permission/permission-point/const.ts",
        "packages/sheets/src/services/permission/permission-point/index.ts",
        "packages/sheets/src/services/permission/permission-point/workbook/share.ts",
        "packages/sheets/src/services/permission/workbook-permission/util.ts"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "协同",
        "OneDrive / SharePoint 保存"
      ],
      "id": "excel-820",
      "query": "onedrive|sharepoint",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "协同",
        "旧版共享工作簿（兼容功能）"
      ],
      "id": "excel-821",
      "query": "legacy.*shar",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "拼写检查"
      ],
      "id": "excel-823",
      "query": "spellcheck|spell.*check",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/design/src/components/color-picker/ColorInput.tsx",
        "packages/engine-formula/src/engine/analysis/lexer-tree-builder.ts",
        "packages/engine-formula/src/engine/analysis/__tests__/lexer-tree-builder.spec.ts",
        "content/docs/features/slides.mdx",
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "同义词查询"
      ],
      "id": "excel-824",
      "query": "thesaurus",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "翻译"
      ],
      "id": "excel-825",
      "query": "translat",
      "matchedFiles": 184,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/src/views/mobile/MobileFindReplaceBar.tsx",
        "packages/drawing-ui/src/commands/operations/__tests__/drawing-arrange-group.operation.spec.ts",
        "packages/drawing-ui/src/views/image-preview/mobile-image-preview-button.ts",
        "packages/drawing-ui/src/views/image-preview/__tests__/mobile-image-preview-button.spec.ts",
        "packages/ui/src/views/slider/Slider.tsx",
        "packages/ui/src/views/components/sidebar/Sidebar.tsx",
        "packages/ui/src/views/components/mobile-zoom-indicator/mobile-zoom-indicator.ts",
        "packages/ui/src/views/components/mobile-drawer/MobileDrawer.tsx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "自动更正"
      ],
      "id": "excel-826",
      "query": "auto.?correct",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "自定义词典"
      ],
      "id": "excel-827",
      "query": "dictionary",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/shared/numfmt/api.ts",
        "packages/sheets-conditional-formatting/src/facade/f-conditional-formatting-builder.ts",
        "packages/sheets-formula-ui/src/services/__tests__/utils.spec.ts",
        "packages/engine-render/src/components/docs/layout/__tests__/doc-skeleton.spec.ts",
        "packages/engine-render/src/components/docs/layout/block/paragraph/shaping.ts",
        "content/docs/features/slides.mdx",
        "content/blog/hyphenation.mdx",
        "content/reference/facade/conditional-formatting-builder.mdx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "语言设置"
      ],
      "id": "excel-828",
      "query": "setLocale",
      "matchedFiles": 132,
      "state": "oss",
      "sources": [
        "audit/content/reference/facade/univer.mdx"
      ],
      "note": "FUniver.setLocale 可切换已加载的语言资源；这是编辑器语言，不是 Office 校对语言包。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/image-popup-menu/__tests__/ImagePopupMenu.spec.tsx",
        "packages/drawing-ui/src/views/panel/__tests__/ImageCropper.spec.tsx",
        "packages/ui/src/controllers/error/__tests__/error.controller.spec.ts",
        "packages/ui/src/views/emoji-picker/__tests__/EmojiPicker.spec.tsx",
        "packages/ui/src/views/slider/__tests__/Slider.spec.tsx",
        "packages/ui/src/views/components/sidebar/__tests__/MobileSidebar.spec.tsx",
        "packages/ui/src/views/components/sidebar/__tests__/Sidebar.spec.tsx",
        "packages/ui/src/views/components/context-menu/__tests__/ContextMenuPanel.spec.tsx"
      ]
    },
    {
      "path": [
        "审阅、协作与云端",
        "校对与语言",
        "墨迹批注"
      ],
      "id": "excel-829",
      "query": "ink.*comment",
      "matchedFiles": 8,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/docs-ui/src/views/float-toolbar/__tests__/FloatToolbar.spec.tsx",
        "packages/engine-render/src/components/docs/layout/doc-skeleton.ts",
        "packages/sheets-thread-comment/src/facade/f-thread-comment.ts",
        "packages/sheets-thread-comment/src/facade/f-event.ts",
        "content/docs/features/shared/comments.mdx",
        "content/blog/univer-1-0.mdx",
        "content/guides/docs/model/document-body.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作表保护",
        "隐藏公式"
      ],
      "id": "excel-833",
      "query": "hide.*formula|formula.*hidden",
      "matchedFiles": 15,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/facade/__tests__/f-defined-name.spec.ts",
        "packages/sheets-data-validation-ui/src/views/components/DataValidationDetail.tsx",
        "packages/sheets-ui/src/controllers/render-controllers/__tests__/desktop-cell-edit.render-controller.spec.ts",
        "packages/sheets-ui/src/controllers/render-controllers/mobile/mobile-cell-edit.render-controller.ts",
        "packages/sheets-ui/src/controllers/editor/editing.render-controller.ts",
        "packages/sheets-ui/src/views/defined-name/DefinedNameContainer.tsx",
        "packages/sheets-formula/src/controllers/trigger-calculation.controller.ts",
        "packages/sheets-formula/src/controllers/__tests__/formula-auto-fill.controller.spec.ts"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "保护工作簿结构"
      ],
      "id": "excel-840",
      "query": "structure.*protect|protect.*structure",
      "matchedFiles": 3,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/core/permission.mdx"
      ],
      "note": "可限制创建/删除/重命名/移动等工作表操作；未找到 Excel 密码式工作簿结构保护文件兼容的证据。",
      "candidateFiles": [
        "packages/sheets-ui/src/services/clipboard/__tests__/clipboard-state.service.spec.ts",
        "packages/engine-formula/src/models/formula-data.model.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "文件打开密码"
      ],
      "id": "excel-841",
      "query": "password",
      "matchedFiles": 7,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:151"
      ],
      "note": "官方对照表明确不支持 Office 文件密码解密、密码打开及加密保存；此项不是普通协作权限。",
      "candidateFiles": [
        "packages/engine-formula/src/functions/text/regexmatch/__tests__/index.spec.ts",
        "packages/engine-formula/src/engine/utils/__tests__/regexp-check.spec.ts",
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/pdf.mdx",
        "content/docs/features/docs.mdx",
        "content/docs/features/relational-table.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "修改密码与只读建议"
      ],
      "id": "excel-842",
      "query": "password|readOnly",
      "matchedFiles": 1066,
      "state": "partial",
      "sources": [
        "audit/content/docs/features/sheets.mdx:151",
        "audit/content/guides/sheets/features/core/permission.mdx"
      ],
      "note": "文件密码机制不受支持；可通过宿主及工作簿权限配置只读。不能视为 Excel 修改密码/只读建议文件机制。",
      "candidateFiles": [
        "packages/find-replace/src/mobile-plugin.ts",
        "packages/find-replace/src/plugin.ts",
        "packages/find-replace/src/__tests__/create-test-bed.ts",
        "packages/find-replace/src/controllers/components.controller.ts",
        "packages/find-replace/src/controllers/find-replace.controller.ts",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/services/find-replace.service.ts",
        "packages/find-replace/src/services/__tests__/find-replace.service.spec.ts"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "受保护的视图"
      ],
      "id": "excel-843",
      "query": "protected.*view",
      "matchedFiles": 32,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets/src/facade/permission/f-worksheet-permission.ts",
        "packages/core/src/sheets/worksheet.ts",
        "packages/docs-ui/src/controllers/render-controllers/zoom.render-controller.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc.render-controller.ts",
        "packages/docs-ui/src/views/heading-collapse-shape.ts",
        "packages/sheets-ui/src/config/config.ts",
        "packages/sheets-ui/src/facade/f-univer.ts",
        "packages/sheets-ui/src/controllers/permission/__tests__/sheet-permission-interceptor-formula-render.controller.spec.ts"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "信任中心"
      ],
      "id": "excel-844",
      "query": "trust.*center",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "受信任位置"
      ],
      "id": "excel-845",
      "query": "trusted.*location",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "宏安全策略"
      ],
      "id": "excel-846",
      "query": "macro.*secur",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "外部内容安全"
      ],
      "id": "excel-847",
      "query": "external.*content.*secur",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "保护、安全与治理",
        "工作簿与文件安全",
        "数字签名验证"
      ],
      "id": "excel-848",
      "query": "digital.*sign",
      "matchedFiles": 3,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx",
        "content/docs/features/docs.mdx",
        "content/blog/di.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "敏感度标签（许可证相关）"
      ],
      "id": "excel-850",
      "query": "sensitivity.*label",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "信息权限管理 IRM"
      ],
      "id": "excel-851",
      "query": "information.*rights|\\birm\\b",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "文档元数据检查"
      ],
      "id": "excel-852",
      "query": "metadata.*inspect",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "移除个人信息"
      ],
      "id": "excel-853",
      "query": "remove.*personal",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-table-ui/src/locale/pt-BR.ts",
        "packages/sheets-table-ui/src/locale/ca-ES.ts",
        "packages/sheets-table-ui/src/locale/it-IT.ts",
        "packages/sheets-table-ui/src/locale/es-ES.ts"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "可访问性检查"
      ],
      "id": "excel-854",
      "query": "accessibility.*check",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx"
      ]
    },
    {
      "path": [
        "保护、安全与治理",
        "组织治理",
        "组织共享策略"
      ],
      "id": "excel-855",
      "query": "shar.*policy",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见对应 Office 文件安全/治理机制的直接实现；宿主权限或可扩展接口不等于该协议/产品功能。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs/src/facade/f-document-permission.ts",
        "content/server/collaboration/database-adapters.mdx",
        "content/reference/facade/base-permission.mdx",
        "content/reference/facade/presentation-permission.mdx",
        "content/reference/facade/board-permission.mdx",
        "content/reference/facade/document-permission.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "开发工具选项卡"
      ],
      "id": "excel-858",
      "query": "developer.*tab",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/server/collaboration/database-adapters.mdx",
        "content/guides/sheets/features/pivot-table.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "录制宏"
      ],
      "id": "excel-859",
      "query": "record.*macro",
      "matchedFiles": 2,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:170"
      ],
      "note": "官方明确不执行现有 VBA 宏/UDF，也不提供操作录制及脚本/宏重放；JavaScript/TypeScript Facade 自动化是另一套机制。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "运行宏"
      ],
      "id": "excel-860",
      "query": "run.*macro",
      "matchedFiles": 2,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:170"
      ],
      "note": "官方明确不执行现有 VBA 宏/UDF，也不提供操作录制及脚本/宏重放；JavaScript/TypeScript Facade 自动化是另一套机制。",
      "candidateFiles": [
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "相对引用录制"
      ],
      "id": "excel-861",
      "query": "relative.*macro",
      "matchedFiles": 0,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:170"
      ],
      "note": "官方明确不执行现有 VBA 宏/UDF，也不提供操作录制及脚本/宏重放；JavaScript/TypeScript Facade 自动化是另一套机制。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "VBA 编辑器"
      ],
      "id": "excel-862",
      "query": "vba.*editor",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "模块与类模块"
      ],
      "id": "excel-863",
      "query": "vba.*module",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "工作簿与工作表事件"
      ],
      "id": "excel-864",
      "query": "vba.*event",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "用户窗体"
      ],
      "id": "excel-865",
      "query": "userform",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "VBA 自定义函数"
      ],
      "id": "excel-866",
      "query": "vba.*function",
      "matchedFiles": 1,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:170"
      ],
      "note": "官方明确不执行现有 VBA 宏/UDF，也不提供操作录制及脚本/宏重放；JavaScript/TypeScript Facade 自动化是另一套机制。",
      "candidateFiles": [
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "加载项 XLAM"
      ],
      "id": "excel-867",
      "query": "\\bxlam\\b",
      "matchedFiles": 0,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:161"
      ],
      "note": "官方不兼容导入/导出 VBA 项目，也不直接运行 VBA；包含 VBA 的 XLAM/宏签名链路不在支持范围。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "宏调试"
      ],
      "id": "excel-868",
      "query": "macro.*debug",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "VBA",
        "宏数字签名"
      ],
      "id": "excel-869",
      "query": "macro.*sign",
      "matchedFiles": 0,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:161"
      ],
      "note": "官方不兼容导入/导出 VBA 项目，也不直接运行 VBA；包含 VBA 的 XLAM/宏签名链路不在支持范围。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "窗体按钮"
      ],
      "id": "excel-871",
      "query": "form.*button",
      "matchedFiles": 21,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/image-preview/mobile-image-preview-button.ts",
        "packages/ui/src/menu/format-painter.menu.ts",
        "packages/ui/src/views/object-permission/ObjectPermissionButton.tsx",
        "packages/design/src/components/select/__tests__/Select.spec.tsx",
        "packages/docs-ui/src/views/mobile-rich-text-toolbar/MobileRichTextToolbar.tsx",
        "packages/sheets-table/src/models/__tests__/table-model.spec.ts",
        "packages/sheets-conditional-formatting-ui/src/views/panel/RuleEdit.tsx",
        "packages/sheets-ui/src/menu/clear.menu.ts"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "窗体复选框"
      ],
      "id": "excel-872",
      "query": "checkbox",
      "matchedFiles": 198,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/data-validation.mdx"
      ],
      "note": "有单元格 Checkbox 验证类型；不是浮动窗体控件，不能等同 VBA/ActiveX 控件。",
      "candidateFiles": [
        "packages/find-replace/src/views/dialog/FindReplaceDialog.tsx",
        "packages/find-replace/src/views/dialog/__tests__/FindReplaceDialog.spec.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceSettings.tsx",
        "packages/drawing-ui/src/views/panel/DrawingTransform.tsx",
        "packages/drawing-ui/src/views/panel/MobileDrawingControls.tsx",
        "packages/drawing-ui/src/views/__tests__/DrawingTransformBehavior.spec.tsx",
        "packages/ui/src/views/object-permission/ObjectPermissionButton.tsx",
        "packages/ui/src/views/object-permission/ObjectPermissionMembers.tsx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "窗体下拉框"
      ],
      "id": "excel-873",
      "query": "form.*dropdown",
      "matchedFiles": 4,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/views/dropdown/__tests__/DateDropdown.spec.tsx",
        "packages/sheets-formula-ui/src/views/formula-editor/hooks/use-formula-search.ts",
        "content/docs/features/docs.mdx",
        "content/guides/sheets/features/core/clipboard.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "窗体滚动条与微调按钮"
      ],
      "id": "excel-874",
      "query": "spin.*button|scroll.*control",
      "matchedFiles": 34,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/docs-find-replace/src/models/docs-find.model.ts",
        "packages/docs-find-replace/src/models/__tests__/docs-find.model.spec.ts",
        "packages/docs-ui/src/mobile-plugin.ts",
        "packages/docs-ui/src/plugin.ts",
        "packages/docs-ui/src/index.ts",
        "packages/docs-ui/src/facade/f-document.ts",
        "packages/docs-ui/src/facade/__tests__/f-document.spec.ts",
        "packages/docs-ui/src/commands/commands/__tests__/misc.command.spec.ts"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "控件链接单元格"
      ],
      "id": "excel-875",
      "query": "control.*linked.*cell",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "ActiveX 控件（Windows，安全设置限制）"
      ],
      "id": "excel-876",
      "query": "activex",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/slides.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "COM 自动化（Windows）"
      ],
      "id": "excel-877",
      "query": "\\bcom\\b",
      "matchedFiles": 712,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/find-replace/package.json",
        "packages/drawing-ui/package.json",
        "packages/drawing-ui/src/locale/pt-BR.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/ui/package.json",
        "packages/ui/src/facade/f-univer.ts",
        "packages/ui/src/controllers/ui/ui-desktop.controller.ts",
        "packages/ui/src/services/shortcut/keycode.ts"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "COM / VSTO 加载项（Windows）"
      ],
      "id": "excel-878",
      "query": "vsto",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "控件与集成",
        "XLL 加载项（Windows）"
      ],
      "id": "excel-879",
      "query": "\\bxll\\b",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/text/ko-KR.ts",
        "packages/engine-formula/src/locale/function-list/text/vi-VN.ts",
        "packages/engine-formula/src/locale/function-list/text/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/text/id-ID.ts",
        "packages/engine-formula/src/locale/function-list/text/pl-PL.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "Office Web 加载项"
      ],
      "id": "excel-881",
      "query": "office.*add.?in",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/sheets-ui/src/services/clipboard/__tests__/constant.ts",
        "content/guides/pdfs/features/edit-history.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "任务窗格加载项"
      ],
      "id": "excel-882",
      "query": "task.*pane.*add",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "Excel JavaScript API"
      ],
      "id": "excel-883",
      "query": "excel.*javascript",
      "matchedFiles": 10,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/core/sheets-api.mdx",
        "audit/content/guides/sheets/features/core/formula.mdx"
      ],
      "note": "Univer 有自身 JavaScript Facade/自定义函数接口；不兼容 Microsoft Office.js 对象模型或 Excel 加载项部署。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/logical/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/logical/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/logical/ar-SA.ts",
        "packages/engine-formula/src/locale/function-list/logical/it-IT.ts",
        "packages/engine-formula/src/locale/function-list/logical/de-DE.ts",
        "packages/engine-formula/src/locale/function-list/logical/id-ID.ts",
        "packages/engine-formula/src/locale/function-list/logical/pl-PL.ts",
        "content/docs/features/sheets.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "加载项自定义函数"
      ],
      "id": "excel-884",
      "query": "add.?in.*function",
      "matchedFiles": 1,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/core/sheets-api.mdx",
        "audit/content/guides/sheets/features/core/formula.mdx"
      ],
      "note": "Univer 有自身 JavaScript Facade/自定义函数接口；不兼容 Microsoft Office.js 对象模型或 Excel 加载项部署。",
      "candidateFiles": [
        "content/guides/sheets/features/core/index.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "Office Scripts 录制"
      ],
      "id": "excel-885",
      "query": "office.*script.*record",
      "matchedFiles": 0,
      "state": "unsupported",
      "sources": [
        "audit/content/docs/features/sheets.mdx:170"
      ],
      "note": "官方明确不执行现有 VBA 宏/UDF，也不提供操作录制及脚本/宏重放；JavaScript/TypeScript Facade 自动化是另一套机制。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "Office Scripts 编辑与运行"
      ],
      "id": "excel-886",
      "query": "office.*script",
      "matchedFiles": 5,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/ui/src/services/clipboard/__tests__/clipboard-interface.service.spec.ts",
        "content/docs/index.mdx",
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/blog/custom-formula.mdx"
      ]
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "Power Automate 脚本流程"
      ],
      "id": "excel-887",
      "query": "power.*automate",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "开发、宏与自动化",
        "Office 平台",
        "组织加载项部署"
      ],
      "id": "excel-888",
      "query": "add.?in.*deploy",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Microsoft 宏/控件/加载项协议的原生兼容实现；Univer 插件、Facade 与 JavaScript 自动化不等于 VBA/Office.js/COM。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/shared/collaboration.mdx",
        "content/ai/index.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "股票数据类型"
      ],
      "id": "excel-891",
      "query": "stock.*data",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/charts.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "地理数据类型"
      ],
      "id": "excel-892",
      "query": "geograph",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "数据类型字段卡片"
      ],
      "id": "excel-893",
      "query": "data.*type.*card",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "插入数据类型字段"
      ],
      "id": "excel-894",
      "query": "insert.*data.*field",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/docs.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "刷新链接数据"
      ],
      "id": "excel-895",
      "query": "refresh.*linked.*data",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "从图片获取数据（平台相关）"
      ],
      "id": "excel-896",
      "query": "image.*data|ocr",
      "matchedFiles": 231,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/index.ts",
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/get-update-params.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/controllers/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/image-cropper.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/image-update.controller.ts",
        "packages/drawing-ui/src/controllers/mobile/image-cropper.controller.ts"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "联网数据",
        "分析数据与自然语言提问"
      ],
      "id": "excel-897",
      "query": "natural.*language",
      "matchedFiles": 2,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/examples/deepseek-harness.mdx",
        "content/blog/hyphenation.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "自然语言辅助生成公式"
      ],
      "id": "excel-899",
      "query": "generat.*formula",
      "matchedFiles": 33,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "packages/sheets/src/controllers/__tests__/formula/subtotal-offset.spec.ts",
        "packages/sheets/src/controllers/__tests__/formula/create-function-test-bed.ts",
        "packages/sheets-table/src/controllers/__tests__/sheet-table-formula.integration.spec.ts",
        "packages/sheets-data-validation-ui/src/views/components/formula-input/ListFormulaInput.tsx",
        "packages/sheets-data-validation/src/validators/__tests__/validators.spec.ts",
        "packages/sheets-ui/src/services/clipboard/clipboard.service.ts",
        "packages/sheets-formula/src/util/calculate.ts",
        "packages/sheets-formula/src/controllers/update-formula.controller.ts"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "解释与修改公式"
      ],
      "id": "excel-900",
      "query": "explain.*formula",
      "matchedFiles": 2,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "packages/engine-formula/src/facade/f-formula.ts",
        "content/reference/facade/formula.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "辅助整理数据"
      ],
      "id": "excel-901",
      "query": "clean.*data",
      "matchedFiles": 3,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "packages/sheets-ui/src/controllers/editor/editing.render-controller.ts",
        "packages/docs/src/commands/mutations/core-editing.mutation.ts",
        "packages/engine-formula/src/locale/function-list/text/id-ID.ts"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "辅助分析与洞察"
      ],
      "id": "excel-902",
      "query": "insight",
      "matchedFiles": 2,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "content/blog/ot.mdx",
        "content/blog/doc-typesetting-design.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "辅助生成图表"
      ],
      "id": "excel-903",
      "query": "generat.*chart",
      "matchedFiles": 2,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "content/docs/features/canvas.mdx",
        "content/blog/univer-1-0.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "辅助编辑工作簿"
      ],
      "id": "excel-904",
      "query": "agent.*edit",
      "matchedFiles": 20,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "content/server/architecture.mdx",
        "content/docs/get-started.mdx",
        "content/docs/index.mdx",
        "content/docs/features/pdf.mdx",
        "content/docs/features/relational-table.mdx",
        "content/docs/features/shared/agents.mdx",
        "content/docs/features/shared/collaboration.mdx",
        "content/docs/features/shared/worktree.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Copilot",
        "多步编辑模式（发布通道相关）"
      ],
      "id": "excel-905",
      "query": "multi.*step",
      "matchedFiles": 1,
      "state": "partial",
      "sources": [
        "audit/content/ai/index.mdx",
        "audit/content/ai/content-operations.mdx"
      ],
      "note": "官方 AI SDK 可供外部 Agent 检查、调用 Facade 修改和验证表格；自然语言理解、模型、规划与 Copilot 式交互由宿主/Agent 提供。未证明是 Excel Copilot 成品功能。",
      "candidateFiles": [
        "content/docs/features/relational-table.mdx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "PY 公式"
      ],
      "id": "excel-907",
      "query": "\\bPY\\b",
      "matchedFiles": 108,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/panel/DrawingTransform.tsx",
        "packages/drawing-ui/src/views/panel/MobileImageCropper.tsx",
        "packages/drawing-ui/src/views/panel/MobileDrawingArrange.tsx",
        "packages/drawing-ui/src/views/panel/MobileDrawingControls.tsx",
        "packages/drawing-ui/src/views/panel/ImageCropper.tsx",
        "packages/drawing-ui/src/views/panel/DrawingArrange.tsx",
        "packages/drawing-ui/src/views/panel/DrawingGroup.tsx"
      ]
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "Python 编辑器"
      ],
      "id": "excel-908",
      "query": "python.*editor",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "引用工作表数据"
      ],
      "id": "excel-909",
      "query": "python.*sheet",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "Python 数据分析"
      ],
      "id": "excel-910",
      "query": "python.*analy",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "Python 可视化"
      ],
      "id": "excel-911",
      "query": "python.*visual",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "Python 对象与 Excel 值输出"
      ],
      "id": "excel-912",
      "query": "python.*object",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "智能功能与联网数据",
        "Python in Excel",
        "云端运行与计算配额"
      ],
      "id": "excel-913",
      "query": "python.*quota",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 联网数据或 Python in Excel 运行时的直接实现；JavaScript 自定义函数与外部 AI 接口不能替代此项。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "应用设置",
        "快速访问工具栏"
      ],
      "id": "excel-916",
      "query": "quick.*access.*toolbar",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "应用设置",
        "加载项管理"
      ],
      "id": "excel-918",
      "query": "add.?in.*manager",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "应用设置",
        "默认字体与新建表数"
      ],
      "id": "excel-919",
      "query": "default.*font|default.*sheet",
      "matchedFiles": 203,
      "state": "partial",
      "sources": [
        "audit/packages/core/src/sheets/typedef.ts:158",
        "audit/content/guides/sheets/features/core/sheets-api.mdx"
      ],
      "note": "工作簿/工作表快照可设置默认样式并配置创建的 sheets；没有 Office 应用级默认字体/新建表数设置面板。",
      "candidateFiles": [
        "packages/ui/src/locale/en-US.ts",
        "packages/ui/src/services/font.service.ts",
        "packages/sheets-thread-comment-ui/src/mobile-plugin.ts",
        "packages/sheets-thread-comment-ui/src/plugin.ts",
        "packages/sheets-thread-comment-ui/src/config/config.ts",
        "packages/sheets-numfmt-ui/src/mobile-plugin.ts",
        "packages/sheets-numfmt-ui/src/plugin.ts",
        "packages/sheets-numfmt-ui/src/config/config.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "应用设置",
        "编辑行为设置"
      ],
      "id": "excel-920",
      "query": "edit.*config|editor.*config",
      "matchedFiles": 85,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/core/index.mdx"
      ],
      "note": "有编辑器、剪贴板、滚动、保护显示等插件配置；未覆盖 Excel 选项中的所有编辑偏好。",
      "candidateFiles": [
        "packages/sheets-thread-comment-ui/src/views/__tests__/SheetsThreadCommentPanel.spec.tsx",
        "packages/sheets/src/facade/permission/f-worksheet-permission.ts",
        "packages/docs-ui/src/index.ts",
        "packages/docs-ui/src/commands/commands/ime-input.command.ts",
        "packages/docs-ui/src/commands/commands/insert-special-character.command.ts",
        "packages/docs-ui/src/commands/commands/doc-header-footer.command.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc-editor-bridge.controller.ts",
        "packages/docs-ui/src/controllers/render-controllers/doc-ime-input.controller.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "应用设置",
        "快捷键与访问键"
      ],
      "id": "excel-924",
      "query": "shortcut",
      "matchedFiles": 332,
      "state": "partial",
      "sources": [
        "audit/content/reference/facade/shortcut.mdx",
        "audit/packages/sheets-ui/src/controllers/shortcuts"
      ],
      "note": "开源有快捷键注册/替换/禁用能力；未证实完整 Office 功能区 Alt 访问键序列。",
      "candidateFiles": [
        "packages/find-replace/src/locale/zh-TW.ts",
        "packages/find-replace/src/locale/pt-BR.ts",
        "packages/find-replace/src/locale/fa-IR.ts",
        "packages/find-replace/src/locale/fr-FR.ts",
        "packages/find-replace/src/locale/ca-ES.ts",
        "packages/find-replace/src/locale/zh-CN.ts",
        "packages/find-replace/src/locale/ko-KR.ts",
        "packages/find-replace/src/locale/vi-VN.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "辅助功能",
        "键盘全流程操作"
      ],
      "id": "excel-926",
      "query": "keyboard",
      "matchedFiles": 198,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-ui/src/controllers/shortcuts"
      ],
      "note": "单元格导航、编辑、格式等有快捷键；未完成全界面仅键盘操作验收，不能标为全流程支持。",
      "candidateFiles": [
        "packages/find-replace/src/views/mobile/MobileFindReplaceBar.tsx",
        "packages/drawing-ui/src/views/object-list-panel/ObjectListPanelBase.tsx",
        "packages/ui/src/index.ts",
        "packages/ui/src/facade/f-shortcut.ts",
        "packages/ui/src/facade/f-univer.ts",
        "packages/ui/src/facade/__tests__/f-univer.spec.ts",
        "packages/ui/src/menu/shortcut-panel.menu.ts",
        "packages/ui/src/controllers/shared-shortcut.controller.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "辅助功能",
        "屏幕阅读器支持"
      ],
      "id": "excel-927",
      "query": "screen.*reader|aria",
      "matchedFiles": 888,
      "state": "partial",
      "sources": [
        "audit/packages/sheets-ui/src/views/status-bar/StatusBar.tsx",
        "audit/packages/ui/src"
      ],
      "note": "部分 DOM 控件有 aria 属性；主表格为 Canvas，未取得完整屏幕阅读器语义网格与端到端验收证据。",
      "candidateFiles": [
        "packages/find-replace/src/locale/id-ID.ts",
        "packages/find-replace/src/views/dialog/FindReplaceDialog.tsx",
        "packages/find-replace/src/views/mobile/MobileFindReplaceBar.tsx",
        "packages/drawing-ui/src/utils/clipboard-image.ts",
        "packages/drawing-ui/src/utils/__tests__/clipboard-image.spec.ts",
        "packages/drawing-ui/src/views/image-popup-menu/ImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/image-popup-menu/MobileImagePopupMenu.tsx",
        "packages/drawing-ui/src/views/image-popup-menu/__tests__/ImagePopupMenu.spec.tsx"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "辅助功能",
        "高对比度"
      ],
      "id": "excel-928",
      "query": "high.*contrast",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/reference/facade/enums.mdx"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "辅助功能",
        "对象替代文字"
      ],
      "id": "excel-929",
      "query": "altText|alternative.*text",
      "matchedFiles": 30,
      "state": "partial",
      "sources": [
        "audit/packages/engine-formula/src/functions/lookup/image/index.ts",
        "audit/packages/sheets-formula/src/controllers/image-formula-cell-interceptor.controller.ts"
      ],
      "note": "IMAGE 公式有 altText 参数；尚未确认浮动图片/形状统一替代文字编辑及屏幕阅读器呈现。",
      "candidateFiles": [
        "packages/sheets-formula/src/controllers/image-formula-cell-interceptor.controller.ts",
        "packages/sheets-formula/src/controllers/__tests__/image-formula-cell-interceptor.controller.spec.ts",
        "packages/engine-formula/src/locale/function-list/cube/de-DE.ts",
        "packages/engine-formula/src/locale/function-list/cube/en-US.ts",
        "packages/engine-formula/src/locale/function-list/lookup/zh-TW.ts",
        "packages/engine-formula/src/locale/function-list/lookup/pt-BR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "packages/engine-formula/src/locale/function-list/lookup/ca-ES.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "辅助功能",
        "可访问性检查器"
      ],
      "id": "excel-930",
      "query": "accessibility.*check",
      "matchedFiles": 1,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "content/docs/features/pdf.mdx"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "平台边界",
        "永久版与 Microsoft 365 差异"
      ],
      "id": "excel-939",
      "query": "microsoft.*365",
      "matchedFiles": 6,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/engine-formula/src/locale/function-list/lookup/fr-FR.ts",
        "content/docs/features/charts.mdx",
        "content/docs/features/slides.mdx",
        "content/docs/features/sheets.mdx",
        "content/docs/features/docs.mdx",
        "content/blog/formula.mdx"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "平台边界",
        "更新通道与渐进发布"
      ],
      "id": "excel-940",
      "query": "update.*channel",
      "matchedFiles": 0,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": []
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "平台边界",
        "旧文件兼容模式"
      ],
      "id": "excel-941",
      "query": "compatibility.*mode",
      "matchedFiles": 16,
      "state": "notfound",
      "sources": [
        "audit/packages",
        "audit/content/guides/sheets",
        "audit/content/reference/facade",
        "audit/content/docs/features"
      ],
      "note": "未见该 Excel 功能的直接实现或等价的官方接口说明；相邻功能、测试字符串和扩展接口不计为该项已实现。 结论限定于锁定版本的公开源码和官方文档，不否定未公开 Pro 能力。",
      "candidateFiles": [
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/sheets-ui/src/services/editor/cell-editor-resize.service.ts",
        "packages/engine-formula/src/functions/compatibility/function-map.ts",
        "packages/engine-formula/src/services/formula/function-list/compatibility.ts",
        "packages/engine-render/src/components/docs/layout/footnote-layout.ts",
        "packages/engine-render/src/components/docs/layout/tools.ts",
        "packages/engine-render/src/components/docs/layout/__tests__/doc-skeleton.spec.ts",
        "packages/engine-render/src/components/docs/layout/model/glyph.ts"
      ]
    },
    {
      "path": [
        "个性化、辅助功能与兼容",
        "平台边界",
        "第三方格式往返保真"
      ],
      "id": "excel-942",
      "query": "fidelity|round.?trip",
      "matchedFiles": 34,
      "state": "partial",
      "sources": [
        "audit/content/guides/sheets/features/import-export.mdx"
      ],
      "note": "Pro 可导入/导出 XLSX，但无覆盖本清单全部 Excel 特性的往返保真保证；CSV/TSV 明确不保留格式。",
      "candidateFiles": [
        "packages/sheets-drawing/src/facade/__tests__/f-worksheet.spec.ts",
        "packages/sheets-drawing/src/controllers/__tests__/sheet-drawing-transform-affected.controller.spec.ts",
        "packages/core/src/types/interfaces/i-document-data.ts",
        "packages/core/src/shared/numfmt/general.ts",
        "packages/core/src/shared/__tests__/record-value.spec.ts",
        "packages/core/src/shared/__tests__/units.spec.ts",
        "packages/core/src/docs/data-model/text-x/__tests__/text-x.spec.ts",
        "packages/docs-toc/src/commands/__tests__/table-of-contents.command.spec.ts"
      ]
    }
  ]
};
