import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

/** 界面词典独立于工作簿数据；只提取 React 产品源码中的 Lingui 消息。 */
export default defineConfig({
  locales: ['en', 'zh'],
  sourceLocale: 'en',
  catalogs: [{ path: '<rootDir>/src/i18n/locales/{locale}/messages', include: ['<rootDir>/src'] }],
  format: formatter({ lineNumbers: false }),
})
