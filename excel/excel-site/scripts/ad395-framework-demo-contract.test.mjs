import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readSiteSource(relativePath) {
  return readFile(path.join(siteRoot, relativePath), 'utf8')
}

const [catalog, demoPage, englishRoute, chineseRoute, englishIndex, chineseIndex, ...demoContent] =
  await Promise.all([
    readSiteSource('src/data/demo-catalog.ts'),
    readSiteSource('src/components/DemoPage.astro'),
    readSiteSource('src/pages/demos/[id].astro'),
    readSiteSource('src/pages/zh/demos/[id].astro'),
    readSiteSource('src/pages/index.astro'),
    readSiteSource('src/pages/zh/index.astro'),
    readSiteSource('src/content/demos/en/viewport-projection.md'),
    readSiteSource('src/content/demos/zh/viewport-projection.md'),
    readSiteSource('src/content/demos/en/react-controlled-projection.md'),
    readSiteSource('src/content/demos/zh/react-controlled-projection.md'),
    readSiteSource('src/content/demos/en/vue-controlled-projection.md'),
    readSiteSource('src/content/demos/zh/vue-controlled-projection.md'),
  ])

const [englishSolid, chineseSolid, englishReact, chineseReact, englishVue, chineseVue] = demoContent

function demoDefinition(id) {
  const start = catalog.indexOf(`id: '${id}',`)
  assert.notEqual(start, -1, `Missing ${id} from the demo catalog`)
  const end = catalog.indexOf('\n  },', start)
  assert.notEqual(end, -1, `Could not isolate ${id} in the demo catalog`)
  return catalog.slice(start, end)
}

function assertRouteDiscovery(routeSource, locale, contentGlob) {
  assert.match(
    routeSource,
    /return demos\.map\(\(demo\) => \(\{ params: \{ id: demo\.id \} \}\)\)/,
    `${locale} routes must derive their paths from the catalog`,
  )
  assert.ok(
    routeSource.includes(contentGlob),
    `${locale} routes must import the matching demo markdown collection`,
  )
}

test('the Solid viewport route remains a worker-WASM Solid island', () => {
  const solidDemo = demoDefinition('viewport-projection')

  assert.match(solidDemo, /runtime: 'worker-wasm'/)
  assert.match(solidDemo, /islands\/DemoIsland\.tsx/)
  assert.ok(
    demoPage.includes('<DemoIsland client:only="solid-js" demoId={id} locale={locale} />'),
    'non-adapter routes must mount through the Solid island',
  )
  assert.match(englishSolid, /Rust\/WASM workbook.*Web Worker/s)
  assert.match(chineseSolid, /Rust\/WASM 工作簿.*Web Worker/s)
})

test('React and Vue routes remain their own controlled-projection islands', () => {
  const reactDemo = demoDefinition('react-controlled-projection')
  const vueDemo = demoDefinition('vue-controlled-projection')

  assert.match(reactDemo, /runtime: 'static'/)
  assert.match(reactDemo, /ReactAdapterDemoIsland\.tsx/)
  assert.match(vueDemo, /runtime: 'static'/)
  assert.match(vueDemo, /VueAdapterDemoIsland\.vue/)
  assert.ok(demoPage.includes("id === 'react-controlled-projection'"))
  assert.ok(demoPage.includes('<ReactAdapterDemoIsland client:only="react" locale={locale} />'))
  assert.ok(demoPage.includes("id === 'vue-controlled-projection'"))
  assert.ok(demoPage.includes('<VueAdapterDemoIsland client:only="vue" locale={locale} />'))
  assert.match(englishReact, /local React island.*controlled inputs/s)
  assert.match(chineseReact, /本地 React island.*受控输入/s)
  assert.match(englishVue, /local Vue island.*controlled inputs/s)
  assert.match(chineseVue, /本地 Vue island.*受控输入/s)
})

test('the framework demos have discoverable English and Chinese catalog content', () => {
  assertRouteDiscovery(englishRoute, 'English', "import.meta.glob('../../content/demos/en/*.md'")
  assertRouteDiscovery(chineseRoute, 'Chinese', "import.meta.glob('../../../content/demos/zh/*.md'")

  for (const [id, english, chinese] of [
    ['viewport-projection', englishSolid, chineseSolid],
    ['react-controlled-projection', englishReact, chineseReact],
    ['vue-controlled-projection', englishVue, chineseVue],
  ]) {
    demoDefinition(id)
    assert.match(english, /^title: .+/m, `Missing English ${id} frontmatter`)
    assert.match(chinese, /^title: .+/m, `Missing Chinese ${id} frontmatter`)
  }
})

test('site copy states the pre-release boundary without publication or parity promises', () => {
  assert.match(englishIndex, /pre-release site presents repository source/)
  assert.match(
    englishIndex,
    /No npm-published package or independently\s+verified offline installation is available/s,
  )
  assert.match(englishIndex, /no support, compatibility, or performance\s+promises/s)
  assert.match(chineseIndex, /项目以仓库源码的预发布形态提供/)
  assert.match(chineseIndex, /没有 npm 发布包或经过独立验证的离线安装/)
  assert.match(chineseIndex, /也不作支持、兼容性或性能承诺/)
  assert.match(
    englishVue,
    /not a published package.*no support, compatibility, or performance promise/s,
  )
  assert.match(chineseVue, /不是已发布的包.*不作支持、兼容性或性能承诺/s)
})
