import { createStore } from '@einfach/core'
import { Provider } from '@einfach/react'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { samplePlugin } from '../src'
import { pingSampleAtom, samplePingCountAtom } from '../src/core'

function renderContribution(Component: () => JSX.Element | null, locale: 'en' | 'zh' = 'en') {
  const store = createStore()
  const i18n = setupI18n({ locale, messages: { en: {}, zh: {} } })
  for (const [code, messages] of Object.entries(samplePlugin.messages ?? {}))
    if (messages) i18n.load(code, messages)
  render(<I18nProvider i18n={i18n}><Provider store={store}><Component /></Provider></I18nProvider>)
  return store
}

describe('sample plugin', () => {
  it('counts pings in its own core atom', () => {
    const store = createStore()
    store.setter(pingSampleAtom)
    store.setter(pingSampleAtom)
    expect(store.getter(samplePingCountAtom)).toBe(2)
  })

  it('contributes a ribbon button that dispatches the ping command', () => {
    const Group = samplePlugin.ribbon![0]!.Group as () => JSX.Element
    const store = renderContribution(Group)
    fireEvent.click(screen.getByRole('button', { name: 'Sample ping' }))
    expect(store.getter(samplePingCountAtom)).toBe(1)
  })

  it('shows the localized status panel', () => {
    const Panel = samplePlugin.panels![0] as () => JSX.Element
    renderContribution(Panel, 'zh')
    expect(screen.getByRole('status')).toHaveTextContent('示例插件计数：0')
  })

  it('exposes the ping command to the cell context menu', () => {
    expect(samplePlugin.contextMenu).toEqual([
      expect.objectContaining({ id: 'sample.ping', command: pingSampleAtom }),
    ])
  })
})
