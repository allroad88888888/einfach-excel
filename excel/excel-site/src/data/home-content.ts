export type HomeLocale = 'en' | 'zh'

type HomePath = {
  id: 'workflow' | 'scale' | 'formula'
  route: 'workbench' | 'viewport-projection' | 'lazy-formulas'
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
    previewStatus: string
  }
  signals: Array<{ icon: string; title: string; description: string }>
  thesis: { index: string; title: string }
  features: Array<{
    number: string
    title: string
    description: string
    action: string
    target: 'scale' | 'formula' | 'backend'
  }>
  evaluation: { index: string; title: string; intro: string; paths: HomePath[] }
  integration: { index: string; title: string; description: string }
  install: {
    index: string
    title: string
    description: string
    command: string
    primaryAction: string
    secondaryAction: string
    note: string
  }
}

export const homeContent: Record<HomeLocale, HomeContent> = {
  en: {
    hero: {
      kicker: 'DEMAND-DRIVEN FORMULA ENGINE',
      titleStart: 'Calculate visible results.',
      titleAccent: 'Skip unrelated formulas.',
      summary:
        'Visible results trigger formula evaluation on demand. If they depend on off-screen cells or another sheet, the engine follows the dependency chain automatically; unrelated formulas stay unevaluated.',
      primaryAction: 'See demand-driven formulas',
      secondaryAction: 'Try the full workbench',
      note: 'Visible reads · Automatic cross-sheet dependencies · Worker-hosted Rust/WASM',
      previewStatus: 'E8 → 5 dependencies evaluated on demand',
    },
    signals: [
      {
        icon: 'ƒ',
        title: 'On-demand formula values',
        description: 'Visible results pull only the formulas they actually depend on.',
      },
      {
        icon: '↳',
        title: 'Off-screen + cross-sheet',
        description: 'Required dependencies resolve automatically wherever they live.',
      },
      {
        icon: '◌',
        title: 'Worker-hosted Rust/WASM',
        description: 'Keep the calculation path away from the browser main thread.',
      },
    ],
    thesis: {
      index: '01 / PRODUCT THESIS',
      title: 'Calculate the requested result—not every formula in the workbook.',
    },
    features: [
      {
        number: '01',
        title: 'Evaluate the dependency chain, not every formula.',
        description:
          'A visible result can pull required formulas from off-screen cells or other sheets. Formula values outside that chain stay cold.',
        action: 'Watch formulas calculate on demand',
        target: 'formula',
      },
      {
        number: '02',
        title: 'Render the window, not the workbook.',
        description:
          'Bounded projections let the renderer ask for visible cells instead of expanding an entire workbook into the browser.',
        action: 'Test 100,000 rows',
        target: 'scale',
      },
      {
        number: '03',
        title: 'Fit the grid to your backend.',
        description:
          'A typed backend port keeps workbook authority, storage, and mutations inside the system your product already owns.',
        action: 'Read the backend contract',
        target: 'backend',
      },
    ],
    evaluation: {
      index: '02 / EVALUATE BY JOB',
      title: 'Prove the hard part before you integrate.',
      intro:
        'Pick the risk your team cares about. Each path opens a running demo, a plain-language explanation, and the source behind it.',
      paths: [
        {
          id: 'formula',
          route: 'lazy-formulas',
          label: 'Prove formula demand',
          eyebrow: 'FORMULAS',
          title: 'Request one visible result. Let the engine fetch the rest.',
          description:
            'The requested formula pulls required inputs from off-screen cells and other sheets. Formulas outside that dependency chain remain unevaluated.',
          action: 'Open on-demand formula demo',
        },
        {
          id: 'workflow',
          route: 'workbench',
          label: 'Embed a workbench',
          eyebrow: 'WORKBENCH',
          title: 'Let business teams work in a familiar surface inside your product.',
          description:
            'Use the complete workbench to test selection, editing, formulas, filters, comments, and worksheet structure together.',
          action: 'Try the live workbench',
        },
        {
          id: 'scale',
          route: 'viewport-projection',
          label: 'Test 100,000 rows',
          eyebrow: 'VIEWPORT',
          title: 'Scroll 100,000 rows, then inspect the projection boundary.',
          description:
            'Observe how the UI asks for a bounded window instead of expanding every workbook cell into the DOM.',
          action: 'Open viewport demo',
        },
      ],
    },
    integration: {
      index: '03 / INTEGRATE',
      title: 'Choose the integration that exists today.',
      description:
        'Install the published Solid binding, study the React or Vue controlled-projection references, or start from the backend port.',
    },
    install: {
      index: '04 / START BUILDING',
      title: 'From npm to your first formula.',
      description:
        'Follow the five-minute Solid guide to install the packages, mount the Worker backend, and verify =1+2 in a real cell.',
      command: 'npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js',
      primaryAction: 'Open the five-minute guide',
      secondaryAction: 'Browse the API',
      note: 'Current release: 0.1.0 · Node.js 22.12+ · Pin the minor for a stable API surface',
    },
  },
  zh: {
    hero: {
      kicker: 'DEMAND-DRIVEN FORMULA ENGINE',
      titleStart: '只算可视结果，',
      titleAccent: '不算无关公式。',
      summary:
        '可视结果触发按需求值；结果依赖到屏外区域或其它工作表时，引擎会自动沿依赖链继续计算。与当前结果无关的公式保持未求值。',
      primaryAction: '查看按需公式演示',
      secondaryAction: '体验完整工作台',
      note: '可视读取 · 自动跨表追踪依赖 · Worker 内 Rust/WASM 引擎',
      previewStatus: 'E8 → 按需求值 5 个依赖',
    },
    signals: [
      { icon: 'ƒ', title: '公式值按需计算', description: '可视结果只拉取自己真正依赖的公式。' },
      { icon: '↳', title: '屏外 + 跨表依赖', description: '必要依赖无论在哪里，都会被自动解析。' },
      { icon: '◌', title: 'Worker 内 Rust/WASM', description: '让公式计算路径远离浏览器主线程。' },
    ],
    thesis: {
      index: '01 / PRODUCT THESIS',
      title: '计算用户请求的结果，而不是工作簿里的每个公式。',
    },
    features: [
      {
        number: '01',
        title: '只计算依赖链，不计算所有公式。',
        description:
          '可视结果会自动拉取屏外或其它工作表中的必要公式；依赖链之外的公式值保持未求值。',
        action: '观察公式按需计算',
        target: 'formula',
      },
      {
        number: '02',
        title: '渲染窗口，而不是整个工作簿。',
        description: '视口投影让渲染层只处理用户看得见的单元格，无需把完整工作簿塞进浏览器。',
        action: '测试 10 万行',
        target: 'scale',
      },
      {
        number: '03',
        title: '让网格适配你的后端。',
        description: '类型化后端端口让工作簿权威、存储与写操作继续留在产品已有系统中。',
        action: '阅读后端契约',
        target: 'backend',
      },
    ],
    evaluation: {
      index: '02 / EVALUATE BY JOB',
      title: '先验证最难的部分，再决定接入。',
      intro: '选择团队最在意的风险。每条路径都包含可运行演示、直白说明与对应源码。',
      paths: [
        {
          id: 'formula',
          route: 'lazy-formulas',
          label: '验证按需公式',
          eyebrow: 'FORMULAS',
          title: '只请求一个可视结果，其余依赖交给引擎。',
          description:
            '当前公式会自动拉取屏外和其它工作表中的必要输入；依赖链之外的公式保持未求值。',
          action: '打开按需公式演示',
        },
        {
          id: 'workflow',
          route: 'workbench',
          label: '嵌入业务工作台',
          eyebrow: 'WORKBENCH',
          title: '让业务团队在你的产品里使用熟悉的工作界面。',
          description: '用完整工作台一起验证选区、编辑、公式、筛选、注释与工作表结构。',
          action: '体验在线工作台',
        },
        {
          id: 'scale',
          route: 'viewport-projection',
          label: '测试 10 万行',
          eyebrow: 'VIEWPORT',
          title: '滚动 10 万行，再检查它的投影边界。',
          description: '观察 UI 如何随滚动请求一个有界窗口，而不把工作簿数据一次性展开放进 DOM。',
          action: '打开视口演示',
        },
      ],
    },
    integration: {
      index: '03 / INTEGRATE',
      title: '选择今天已经存在的集成路径。',
      description: '安装已发布的 Solid 绑定，研究 React / Vue 受控投影参考，或从后端端口开始。',
    },
    install: {
      index: '04 / START BUILDING',
      title: '从 npm 到第一个公式。',
      description: '跟着五分钟 Solid 指南安装依赖、挂载 Worker 后端，并在真实单元格里验证 =1+2。',
      command: 'npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js',
      primaryAction: '打开五分钟指南',
      secondaryAction: '浏览 API',
      note: '当前版本：0.1.0 · Node.js 22.12+ · 需要稳定 API 时请锁定次版本',
    },
  },
}
