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
      status: 'FORMAL UI BINDING',
      title: 'Solid',
      description: 'Use the provided UI binding when Solid is the application surface you own.',
      action: 'Start with Solid',
      featured: true,
    },
    {
      id: 'react',
      status: 'CONTROLLED PROJECTION REFERENCE',
      title: 'React',
      description: 'Study the controlled projection demo. It is a reference integration, not a published adapter.',
      action: 'Open React reference',
    },
    {
      id: 'vue',
      status: 'CONTROLLED PROJECTION REFERENCE',
      title: 'Vue',
      description: 'Study the controlled projection demo. It makes the host boundary explicit before an adapter exists.',
      action: 'Open Vue reference',
    },
    {
      id: 'backend',
      status: 'BACKEND PORT CONTRACT',
      title: 'Custom backend',
      description: 'Implement the backend port when the workbook, storage, or compute model is already yours.',
      action: 'Read backend port',
    },
  ],
  zh: [
    {
      id: 'solid',
      status: '正式 UI 绑定',
      title: 'Solid',
      description: '如果你的应用表面由 Solid 承担，直接使用已提供的 UI 绑定。',
      action: '从 Solid 开始',
      featured: true,
    },
    {
      id: 'react',
      status: '受控投影参考',
      title: 'React',
      description: '查看受控投影演示。它是参考接入，不是已发布的框架适配器。',
      action: '打开 React 参考',
    },
    {
      id: 'vue',
      status: '受控投影参考',
      title: 'Vue',
      description: '查看受控投影演示，在正式适配器出现前先明确宿主边界。',
      action: '打开 Vue 参考',
    },
    {
      id: 'backend',
      status: '后端端口契约',
      title: '自定义后端',
      description: '若工作簿、存储或计算模型已经属于你的产品，实现后端端口即可接入。',
      action: '阅读后端端口',
    },
  ],
}
