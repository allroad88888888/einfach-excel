import { lazy } from 'solid-js'
import { HashRouter, Route, Navigate } from '@solidjs/router'
import SiteLayout from './shell/SiteLayout'

const LandingPage = lazy(() => import('./landing/LandingPage'))
const DemoGalleryPage = lazy(() => import('./demos/DemoGalleryPage'))
const DemoPage = lazy(() => import('./demos/DemoPage'))
const WorkbenchPage = lazy(() => import('./workbench/WorkbenchPage'))

export default function AppRouter() {
  return (
    <HashRouter root={SiteLayout}>
      <Route path="/" component={LandingPage} />
      <Route path="/demos" component={DemoGalleryPage} />
      <Route path="/demos/:id" component={DemoPage} />
      <Route path="/workbench" component={WorkbenchPage} />
      <Route path="*" component={() => <Navigate href="/" />} />
    </HashRouter>
  )
}
