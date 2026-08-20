import { apiReferenceContentEn } from './api-reference-content.en'
import { apiReferenceContentZh } from './api-reference-content.zh'
import type { ApiReferenceContent, ApiReferenceLocale } from './api-reference-types'

export type { ApiReferenceContent, ApiReferenceLocale } from './api-reference-types'

export const apiReferenceContent: Record<ApiReferenceLocale, ApiReferenceContent> = {
  en: apiReferenceContentEn,
  zh: apiReferenceContentZh,
}
