import { useId, type KeyboardEvent } from 'react'

/** 回车或失焦才提交：一次输入一条撤销记录，不在每个按键写 Rust。 */
const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

export function TextField({ label, value, disabled, onCommit }: {
  readonly label: string
  readonly value: string
  readonly disabled: boolean
  readonly onCommit: (value: string) => void
}) {
  const id = useId()
  return <div className="plugin-chart-field">
    <label htmlFor={id}>{label}</label>
    {/* 撤销等外部改动换 key 重建，草稿不与 Rust 事实分叉。 */}
    <input key={value} id={id} type="text" defaultValue={value} disabled={disabled}
      maxLength={255} onKeyDown={commitOnEnter}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value)
      }} />
  </div>
}

export function NumberField({ label, value, placeholder, disabled, onCommit }: {
  readonly label: string
  readonly value: number | null
  readonly placeholder: string
  readonly disabled: boolean
  readonly onCommit: (value: number | null) => void
}) {
  const id = useId()
  const text = value === null ? '' : String(value)
  return <div className="plugin-chart-field">
    <label htmlFor={id}>{label}</label>
    <input key={text} id={id} type="number" defaultValue={text} placeholder={placeholder}
      disabled={disabled} onKeyDown={commitOnEnter}
      onBlur={(event) => {
        const raw = event.currentTarget.value.trim()
        const next = raw === '' ? null : Number(raw)
        if (next !== value && (next === null || Number.isFinite(next))) onCommit(next)
      }} />
  </div>
}

export function Toggle({ label, checked, disabled, onChange }: {
  readonly label: string
  readonly checked: boolean
  readonly disabled: boolean
  readonly onChange: (checked: boolean) => void
}) {
  return <label className="plugin-chart-toggle">
    <input type="checkbox" checked={checked} disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)} />
    {label}
  </label>
}

export function Choice<T extends string>({ label, value, options, disabled, onChange }: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly disabled: boolean
  readonly onChange: (value: T) => void
}) {
  const id = useId()
  return <div className="plugin-chart-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value as T)}>
      {options.map((option) =>
        <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>
}
