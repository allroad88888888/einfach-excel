import type { JSX } from 'solid-js'
import SiteHeader from './SiteHeader'
import SiteFooter from './SiteFooter'

type SiteLayoutProps = {
  children?: JSX.Element
}

export default function SiteLayout(props: SiteLayoutProps) {
  return (
    <div class="site-shell">
      <SiteHeader />
      <main class="site-main">{props.children}</main>
      <SiteFooter />
    </div>
  )
}
