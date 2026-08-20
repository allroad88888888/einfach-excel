export type HomeLocale = 'en' | 'zh'

type HomePath = {
  id: 'workflow' | 'scale' | 'formula'
  route: 'workbench' | 'viewport-projection' | 'formula-engine'
  label: string
  eyebrow: string
  title: string
  description: string
  action: string
}

export type HomeContent = {
  hero: {
    kicker: string
    titleStart: string
    titleAccent: string
    summary: string
    primaryAction: string
    secondaryAction: string
    note: string
  }
  signals: Array<{ icon: string; title: string; description: string }>
  thesis: { index: string; title: string }
  features: Array<{
    number: string
    title: string
    description: string
    action: string
    target: string
  }>
  evaluation: { index: string; title: string; intro: string; paths: HomePath[] }
  integration: { index: string; title: string; description: string }
}

export const homeContent: Record<HomeLocale, HomeContent> = {
  en: {
    hero: {
      kicker: 'OPEN SOURCE SPREADSHEET INFRASTRUCTURE',
      titleStart: 'Make the spreadsheet a product capability,',
      titleAccent: 'not a black box.',
      summary:
        'A spreadsheet UI for real workflows: keep the viewport bounded, move computation to a Worker, and choose the workbook backend that fits your product.',
      primaryAction: 'Open the workbench',
      secondaryAction: 'See integration',
      note: 'Framework-agnostic UI core · Solid reference implementation · Rust/WASM workbook engine',
    },
    signals: [
      {
        icon: '⌗',
        title: 'Bounded projection',
        description: 'Request only the worksheet projection in view.',
      },
      {
        icon: '◌',
        title: 'Worker computation',
        description: 'Move formula calculation off the main thread.',
      },
      {
        icon: '⌘',
        title: 'Bring your backend',
        description: 'Keep the UI distinct from the data source.',
      },
    ],
    thesis: {
      index: '01 / PRODUCT THESIS',
      title: 'Built for your product workflow, not a desktop Excel remake.',
    },
    features: [
      {
        number: '01',
        title: 'Set a boundary before the data gets big.',
        description:
          'Viewport projection lets the renderer work with visible cells instead of expanding a full workbook into the browser.',
        action: 'Explore viewport projection',
        target: 'paths',
      },
      {
        number: '02',
        title: 'Keep computation in the background.',
        description:
          'A Rust/WASM workbook can run in a Web Worker while the main thread keeps scrolling, editing, and keyboard input responsive.',
        action: 'See the runtime boundary',
        target: 'integrate',
      },
      {
        number: '03',
        title: 'Keep control of your data.',
        description:
          'The framework-agnostic UI core reads and writes through a backend port that can meet your product where it is.',
        action: 'Read the architecture',
        target: 'docs',
      },
    ],
    evaluation: {
      index: '02 / EVALUATE BY JOB',
      title: 'Start with the question you need to answer.',
      intro:
        'The homepage does not list every capability. Pick a real task and go straight to its running demo and explanation.',
      paths: [
        {
          id: 'workflow',
          route: 'workbench',
          label: 'Embed a workbench',
          eyebrow: 'WORKBENCH',
          title: 'Give operations, finance, or sales an editable business surface.',
          description:
            'See the full workbench: selection, editing, formulas, filters, comments, and worksheet structure share one UI state.',
          action: 'Open workbench demo',
        },
        {
          id: 'scale',
          route: 'viewport-projection',
          label: 'Validate large-sheet scroll',
          eyebrow: 'VIEWPORT',
          title: 'Feel the scroll first, then inspect the projection boundary.',
          description:
            'Observe how the UI asks for a bounded window instead of expanding every workbook cell into the DOM.',
          action: 'Open viewport demo',
        },
        {
          id: 'formula',
          route: 'formula-engine',
          label: 'Test formula behavior',
          eyebrow: 'FORMULAS',
          title: 'Start with a formula case you can explain.',
          description:
            'Validate lazy calculation, dynamic arrays, or custom functions against the workbook behavior you expect.',
          action: 'Open formula demo',
        },
      ],
    },
    integration: {
      index: '03 / INTEGRATE',
      title: 'Choose the starting path your stack actually has.',
      description:
        'Solid has the formal UI binding. React and Vue are controlled-projection references, while custom systems begin at the backend port.',
    },
  },
  zh: {
    hero: {
      kicker: 'OPEN SOURCE SPREADSHEET INFRASTRUCTURE',
      titleStart: '让表格成为产品能力，',
      titleAccent: '而不是一块黑箱。',
      summary:
        '面向真实工作流的电子表格 UI：可视窗口保持有界，计算移到 Worker，工作簿后端由你的产品决定。',
      primaryAction: '打开工作台',
      secondaryAction: '查看集成方式',
      note: '框架无关 UI 核心 · Solid 参考实现 · Rust/WASM 工作簿引擎',
    },
    signals: [
      { icon: '⌗', title: '有界投影', description: '只请求当前视口所需的表格投影。' },
      { icon: '◌', title: 'Worker 计算', description: '把公式计算从主线程中移开。' },
      { icon: '⌘', title: '自选后端', description: 'UI 与数据来源保持清晰边界。' },
    ],
    thesis: {
      index: '01 / PRODUCT THESIS',
      title: '为了你的业务流程而生，不是复刻一个桌面 Excel。',
    },
    features: [
      {
        number: '01',
        title: '在数据真正变大前，先把边界立起来。',
        description: '视口投影让渲染层只处理用户看得见的单元格，无需把完整工作簿塞进浏览器。',
        action: '体验投影视口',
        target: 'paths',
      },
      {
        number: '02',
        title: '让计算留在后台。',
        description: 'Rust/WASM 工作簿运行于 Web Worker，主线程继续接住滚动、编辑与键盘交互。',
        action: '看运行时边界',
        target: 'integrate',
      },
      {
        number: '03',
        title: '保留你的数据主权。',
        description: '框架无关的 UI 核心通过后端端口读写工作簿，适合接入已有服务或本地模型。',
        action: '阅读架构说明',
        target: 'docs',
      },
    ],
    evaluation: {
      index: '02 / EVALUATE BY JOB',
      title: '从你要验证的那个问题开始。',
      intro: '首页不再陈列所有能力。选择一个真实任务，直接进入对应的运行演示与说明。',
      paths: [
        {
          id: 'workflow',
          route: 'workbench',
          label: '嵌入业务工作台',
          eyebrow: 'WORKBENCH',
          title: '给运营、财务、销售一个可编辑的业务表面。',
          description:
            '查看完整工作台：选区、编辑、公式、筛选、注释与工作表结构都以同一套 UI 状态协作。',
          action: '打开工作台演示',
        },
        {
          id: 'scale',
          route: 'viewport-projection',
          label: '验证大表格滚动',
          eyebrow: 'VIEWPORT',
          title: '先感受大表滚动，再看其投影边界。',
          description: '观察 UI 如何随滚动请求一个有界窗口，而不把工作簿数据一次性展开放进 DOM。',
          action: '打开视口演示',
        },
        {
          id: 'formula',
          route: 'formula-engine',
          label: '测试公式行为',
          eyebrow: 'FORMULAS',
          title: '从一个可解释的公式案例开始。',
          description: '验证惰性计算、动态数组或自定义公式，确认它们是否符合你的工作簿行为预期。',
          action: '打开公式演示',
        },
      ],
    },
    integration: {
      index: '03 / INTEGRATE',
      title: '按你的框架，选一条真实的起点。',
      description: 'Solid 具备正式 UI 绑定。React 与 Vue 目前提供受控投影参考；自定义系统从后端端口开始。',
    },
  },
}
