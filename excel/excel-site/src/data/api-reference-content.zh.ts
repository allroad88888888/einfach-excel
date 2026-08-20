import type { ApiReferenceContent } from './api-reference-types'

export const apiReferenceContentZh: ApiReferenceContent = {
  title: '前端交互 API',
  eyebrow: '操作接口',
  summary: '从 UI 中选择单元格、修改值与公式、处理剪贴板状态、撤销或重做操作。',
  intro: '这页只讲前端交互 API。每个条目都说明它改变哪一部分界面状态、要传什么，以及完成哪一个用户操作。',
  task: {
    title: '给一个单元格设置值',
    description: '以 A1 为例：先让它成为当前单元格，打开编辑会话，更新编辑草稿，最后提交。用户在格子里输入，或在公式栏编辑，走的都是这条链路。',
    steps: [
      { symbol: 'selectCellAtom', detail: '把目标坐标设为当前单元格。' },
      { symbol: 'startEditingAtom', detail: '用该单元格现有文本打开编辑会话。' },
      { symbol: 'editingDraftAtom', detail: '在编辑器打开期间写入新的文本或公式。' },
      { symbol: 'runEditingCommitAtom', detail: '提交当前草稿；可选择提交后移动到下一个单元格。' },
    ],
  },
  groups: [
    {
      title: '选中与移动',
      description: '按钮、名称框、键盘处理器或自定义 UI 需要控制当前单元格与选区时，使用这些 API。',
      symbols: [
        { name: 'selectCellAtom', kind: '写入 Atom', description: '选中一个单元格；也可以从当前单元格延展出一个矩形范围。', input: '行列坐标；可选工作表标识与 extend 标记。', output: '规范化后的单元格或范围成为当前 UI 选区。', usage: '用于“跳转到单元格”、点击格子，或需要更新选区状态的键盘移动。', route: 'docs/atoms/selection/' },
        { name: 'setSelectionAtom', kind: '写入 Atom', description: '用完整的单元格、范围、整行、整列或整张表选区替换当前选区。', input: '带工作表标识和范围信息的 SelectionState。', output: '所有电子表格表面都可读取的规范化选区。', usage: '当你的 UI 已经知道选区形状时使用，例如名称框解析完 A1:C3 以后。', route: 'docs/atoms/selection/' },
        { name: 'getActiveCell', kind: '纯函数', description: '从任意合法选区中取出活动单元格，即使当前选中的是多格范围。', input: '选区与工作表边界。', output: '活动单元格的工作表标识、行与列。', usage: '在定位编辑器、公式栏、右键菜单或执行键盘命令前调用。', route: 'docs/atoms/selection/' },
        { name: 'moveSelection', kind: '纯函数', description: '只计算下一个选区，不会直接修改应用状态。', input: '当前选区、工作表边界，以及行列偏移或绝对目标坐标。', output: '边界内的下一个单元格；要求扩选时返回范围选区。', usage: '用于自定义键盘导航；将返回结果写入 setSelectionAtom 即可更新界面。', route: 'docs/atoms/selection/' },
      ],
    },
    {
      title: '编辑一个单元格',
      description: '这组 Atom 负责修改显示值或公式的完整交互：打开、更新、提交或取消。',
      symbols: [
        { name: 'startEditingAtom', kind: '写入 Atom', description: '为一个单元格开启编辑会话，并将交互模式切换到编辑状态。', input: '工作表标识、单元格坐标、初始草稿文本与输入来源。', output: '一个新的编辑会话，编辑器 UI 可以读取其中的草稿。', usage: '双击、Enter、F2 或聚焦公式栏后调用。已有提交进行中时不要再开启新会话。', route: 'docs/getting-started/' },
        { name: 'editingDraftAtom', kind: '读写 Atom', description: '保存当前正在编辑的文本；它既可以是普通值，也可以是公式。', input: '写入草稿字符串；可选标注来自哪个 UI 表面。', output: '单元格编辑器或公式栏可以渲染的最新草稿。', usage: '编辑会话活跃时，将输入框的 value 与 input 事件绑定到这个 Atom。', route: 'docs/getting-started/' },
        { name: 'runEditingCommitAtom', kind: '异步写入 Atom', description: '结束当前编辑会话，并把草稿作为该单元格的新值或新公式提交。', input: '已经配置好的编辑动作；可选提交后的移动方向。', output: 'completed、rejected、refresh-failed、outcome-unknown 或 blocked 状态。', usage: '用户按 Enter、Tab，或明确点击保存时调用；读取 editingCommitLifecycleAtom 显示等待与失败反馈。', route: 'docs/getting-started/' },
        { name: 'cancelEditingAtom', kind: '写入 Atom', description: '丢弃当前尚未提交的草稿，并将交互切回导航模式。', input: '不接收参数。', output: '取消意图；没有活跃编辑会话时返回 null。', usage: '按 Escape 或关闭编辑器且不保存时调用。它不会把丢弃的草稿变成单元格值。', route: 'docs/getting-started/' },
      ],
    },
    {
      title: '剪贴板与历史',
      description: '菜单与键盘处理器通过这些 API 共用复制、粘贴、撤销和重做的交互状态。',
      symbols: [
        { name: 'copyClipboardAtom', kind: '写入 Atom', description: '为当前源范围创建复制意图，并将它保存为剪贴板 UI 状态。', input: '源范围、目标描述与可选 payload。', output: '复制意图，以及供 UI 观察的剪贴板状态。', usage: '从“复制”菜单或快捷键调用，然后由剪贴板表面完成用户可见的转移。', route: 'docs/getting-started/' },
        { name: 'pasteClipboardAtom', kind: '写入 Atom', description: '创建粘贴意图，明确记录已保存的源内容和目标范围。', input: '源描述、目标描述与可选剪贴板 payload。', output: '粘贴意图和 pasting 状态。', usage: '用户选定目标单元格或范围后调用；用 clipboardStateAtom 渲染等待和错误状态。', route: 'docs/getting-started/' },
        { name: 'runUndoHistoryAtom', kind: '异步写入 Atom', description: '将电子表格交互回退一个已经记录的用户操作。', input: '已经配置好的撤销动作与刷新回调。', output: 'completed、blocked、refresh-failed 或 outcome-unknown 状态。', usage: 'Ctrl/Cmd+Z 或“撤销”菜单调用前，先通过 canUndoAtom 确认存在可撤销记录。', route: 'docs/getting-started/' },
        { name: 'runRedoHistoryAtom', kind: '异步写入 Atom', description: '在撤销后重新应用交互历史中的下一步操作。', input: '已经配置好的重做动作与刷新回调。', output: 'completed、blocked、refresh-failed 或 outcome-unknown 状态。', usage: 'Ctrl/Cmd+Shift+Z 或“重做”菜单调用前，先通过 canRedoAtom 确认存在可重做记录。', route: 'docs/getting-started/' },
      ],
    },
  ],
}
