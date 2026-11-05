import type { Messages } from '@lingui/core'

export const PING_MESSAGE = { id: 'plugin.sample.ping', message: 'Sample ping' }
export const STATUS_MESSAGE = { id: 'plugin.sample.status', message: 'Sample pings: {count}' }
export const EDITING_MESSAGE = { id: 'plugin.sample.editing', message: 'Sample plugin sees editing' }

export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: {
    [PING_MESSAGE.id]: PING_MESSAGE.message,
    [STATUS_MESSAGE.id]: ['Sample pings: ', ['count']],
    [EDITING_MESSAGE.id]: EDITING_MESSAGE.message,
  },
  zh: {
    [PING_MESSAGE.id]: '示例插件计数',
    [STATUS_MESSAGE.id]: ['示例插件计数：', ['count']],
    [EDITING_MESSAGE.id]: '示例插件检测到编辑',
  },
}
