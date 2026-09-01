import type { HomeLocale } from './home-content'

export type HomeFrameworkId = 'solid' | 'react' | 'vue' | 'backend'

export type HomeFramework = {
  id: HomeFrameworkId
  status: string
  title: string
  description: string
  action: string
  featured?: boolean
}

export const homeFrameworkContent: Record<HomeLocale, HomeFramework[]> = {
  en: [
    {
      id: 'solid',
      status: 'PUBLISHED UI BINDING',
      title: 'Solid',
      description:
        'Install the complete UI path from npm and verify a Worker-backed formula in five minutes.',
      action: 'Open the quickstart',
      featured: true,
    },
    {
      id: 'react',
      status: 'PRIVATE VITE PRODUCT',
      title: 'React',
      description: 'Run the complete repository product against its Rust/WASM worker.',
      action: 'Open the React product guide',
    },
    {
      id: 'vue',
      status: 'CONTROLLED PROJECTION REFERENCE',
      title: 'Vue',
      description: 'Test the public provider and grid APIs through a caller-owned Vue projection.',
      action: 'Inspect the Vue reference',
    },
    {
      id: 'backend',
      status: 'BACKEND PORT CONTRACT',
      title: 'Custom backend',
      description:
        'Keep your workbook, storage, or compute model and implement the bounded port contract.',
      action: 'Read the backend port',
    },
  ],
  zh: [
    {
      id: 'solid',
      status: '已发布 UI 绑定',
      title: 'Solid',
      description: '从 npm 安装完整 UI 路径，五分钟内验证一个 Worker 公式。',
      action: '打开快速开始',
      featured: true,
    },
    {
      id: 'react',
      status: '私有 Vite 产品',
      title: 'React',
      description: '运行由 Rust/WASM worker 驱动的完整仓库内产品。',
      action: '打开 React 产品指南',
    },
    {
      id: 'vue',
      status: '受控投影参考',
      title: 'Vue',
      description: '通过调用方持有的 Vue 投影测试公共 Provider 与 Grid API。',
      action: '检查 Vue 参考',
    },
    {
      id: 'backend',
      status: '后端端口契约',
      title: '自定义后端',
      description: '保留已有工作簿、存储或计算模型，只实现有界端口契约。',
      action: '阅读后端契约',
    },
  ],
}
