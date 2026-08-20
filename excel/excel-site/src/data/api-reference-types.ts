export type ApiReferenceLocale = 'en' | 'zh'

export type ApiSymbol = {
  name: string
  kind: string
  description: string
  input: string
  output: string
  usage: string
  route: string
}

export type ApiGroup = {
  title: string
  description: string
  symbols: ApiSymbol[]
}

export type ApiTask = {
  title: string
  description: string
  steps: Array<{ symbol: string; detail: string }>
}

export type ApiReferenceContent = {
  title: string
  eyebrow: string
  summary: string
  intro: string
  task: ApiTask
  groups: ApiGroup[]
}
