import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { diagonalButton as button, diagonalLines } from '../support/diagonal-borders'

const plugin = `/@fs${fileURLToPath(new URL('../../../../plugins/plugin-cell-appearance/src/index.ts', import.meta.url))}`

test('appearance plugin removal preserves an open diagonal draft and native history across two hosts', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 950 })
  await page.route('**/appearance-host', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <button id="toggle">Toggle plugin</button><div id="first" style="height:430px"></div><div id="second" style="height:430px"></div>
    <script type="module">
    import Refresh from '/@react-refresh'; Refresh.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {Spreadsheet}=await import('/src/index.ts');
    const {cellAppearancePlugin}=await import(${JSON.stringify(plugin)});
    const definition={title:'Appearance host',sheets:[{id:'s',name:'Host',rowCount:30,colCount:8}],
      createImportChunks:()=>[[{sheet:0,row:0,col:0,kind:'text',value:'Kept native value'}]]};
    let installed=true;const first=createRoot(document.getElementById('first'));
    const render=()=>first.render(React.createElement(Spreadsheet,{definition,plugins:installed?[cellAppearancePlugin]:[],locale:'en',style:{height:'100%'}}));
    document.getElementById('toggle').onclick=()=>{installed=!installed;render()};render();
    createRoot(document.getElementById('second')).render(React.createElement(Spreadsheet,{definition,plugins:[],locale:'en',style:{height:'100%'}}));
    </script>` }))
  await page.goto('/appearance-host')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(first.locator('td[data-cell="0:0"]')).toHaveText('Kept native value')
  // Each ribbon exposes its own More button; operate inside the first host.
  const trigger = first.getByRole('button', { name: 'Border settings', exact: true })
  if (!await trigger.isVisible()) await first.locator('[data-ribbon-more]').click()
  await trigger.click()
  await first.getByLabel('Position', { exact: true }).selectOption('diagonal')
  await first.getByLabel('Line style', { exact: true }).selectOption('double')
  await page.locator('#toggle').evaluate(node => (node as HTMLButtonElement).click())
  await expect(first.getByLabel('Position', { exact: true })).toHaveValue('diagonal')
  await expect(first.getByLabel('Position', { exact: true })).toBeVisible()
  await expect(first.getByLabel('Position', { exact: true }).locator('option:checked'))
    .toHaveText('Saved position: diagonal')
  await page.locator('#toggle').evaluate(node => (node as HTMLButtonElement).click())
  await expect(first.getByLabel('Position', { exact: true }).locator('option:checked'))
    .toHaveText('Both diagonals')
  await expect(first.getByLabel('Line style', { exact: true })).toHaveValue('double')
  await page.locator('#toggle').evaluate(node => (node as HTMLButtonElement).click())
  await first.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(diagonalLines(first.locator('td[data-cell="0:0"]'))).toHaveCount(4)
  await expect(diagonalLines(second.locator('td[data-cell="0:0"]'))).toHaveCount(0)
  await expect(second.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(diagonalLines(first.locator('td[data-cell="0:0"]'))).toHaveCount(0)
  await first.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.locator('#toggle').click(); await trigger.click()
  await expect(first.getByLabel('Position', { exact: true }).locator('option[value="diagonal"]'))
    .toHaveText('Both diagonals')
  await first.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('native diagonal seed remains visible without the optional appearance editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('F15:F17'); await name.press('Enter')
  for (const [coord, count] of [['14:5', 1], ['15:5', 1], ['16:5', 4]] as const)
    await expect(page.locator(`td[data-cell="${coord}"] [data-diagonal]`)).toHaveCount(count)
  await showRibbonItem(page, 'format.border-settings'); await button(page, 'Border settings').click()
  await expect(page.getByRole('option', { name: 'Both diagonals' })).toHaveCount(0)
  await button(page, 'Cancel').click()
})
