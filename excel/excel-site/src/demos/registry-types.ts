import type { Component } from 'solid-js'
import type { BackendKind } from '../spreadsheet/chrome-types'

export type DemoMeta = {
  id: string
  titleKey: string
  blurbKey: string
  tags: string[]
  backend: BackendKind
  load: () => Promise<{ default: Component }>
}
