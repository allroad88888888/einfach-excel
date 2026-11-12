/** IDs and region pairing only; numeric display codes belong exclusively to Rust. */
export const NUMBER_FORMAT_SPECIAL_PRESETS = {
  'en-US': ['zip-code', 'zip-plus-4', 'phone-us', 'ssn-us'],
  'zh-CN': ['postal-code-cn'],
} as const
export type SpecialNumberFormatLocale = keyof typeof NUMBER_FORMAT_SPECIAL_PRESETS

export function specialPresetLocale(preset: string): SpecialNumberFormatLocale | undefined {
  return (Object.keys(NUMBER_FORMAT_SPECIAL_PRESETS) as SpecialNumberFormatLocale[])
    .find(locale => (NUMBER_FORMAT_SPECIAL_PRESETS[locale] as readonly string[]).includes(preset))
}

export function validSpecialFormat(preset: string, locale: string): boolean {
  return specialPresetLocale(preset) === locale
}

/** A single locale change also picks that region's first supported type. */
export function specialLocalePreset(locale: string): string | undefined {
  return Object.hasOwn(NUMBER_FORMAT_SPECIAL_PRESETS, locale)
    ? NUMBER_FORMAT_SPECIAL_PRESETS[locale as SpecialNumberFormatLocale][0] : undefined
}
