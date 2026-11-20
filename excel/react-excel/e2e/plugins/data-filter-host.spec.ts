import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { showRibbonItem } from '../support/ribbon'

const plugin = `/@fs${fileURLToPath(new URL('../../../../plugins/plugin-data-filter/src/index.tsx', import.meta.url))}`

async function mount(page: Page) {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.route('**/filter-plugin-hosts', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0"><div id="first" style="height:600px"></div>
    <div id="second" style="height:600px"></div><output id="host-event"></output>
    <script type="module">
      import Refresh from '/@react-refresh'; Refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const {Spreadsheet}=await import('/src/index.ts');
      const {dataFilterPlugin}=await import(${JSON.stringify(plugin)});
      const definition=tag=>({title:tag,sheets:[{id:'s',name:tag,rowCount:40,colCount:5}],
        createImportChunks:()=>[[
          {sheet:0,row:0,col:0,kind:'text',value:'Score'},
          {sheet:0,row:0,col:1,kind:'text',value:'Record'},
          ...[1,3,2].flatMap((value,index)=>[
            {sheet:0,row:index+1,col:0,kind:'number',value},
            {sheet:0,row:index+1,col:1,kind:'text',value:tag+value}])]]});
      const first=createRoot(document.getElementById('first'));
      const firstDefinition=definition('A');
      let installed=true;
      const render=()=>first.render(React.createElement(Spreadsheet,{definition:firstDefinition,
        plugins:installed?[dataFilterPlugin]:[],locale:'en',style:{height:'100%'}}));
      render();
      createRoot(document.getElementById('second')).render(React.createElement(Spreadsheet,{
        definition:definition('B'),plugins:[dataFilterPlugin],locale:'en',style:{height:'100%'}}));
      document.addEventListener('keydown',event=>{
        if(event.altKey&&event.code==='KeyU') {
          event.preventDefault();installed=false;render();
          document.getElementById('host-event').textContent='uninstalled';
        }
      });
    </script></body></html>`,
  }))
  await page.goto('/filter-plugin-hosts')
  await expect(page.locator('#first td[data-cell="1:1"]')).toHaveText('A1')
  await expect(page.locator('#second td[data-cell="1:1"]')).toHaveText('B1')
}

async function open(scope: Locator) {
  const name = scope.getByRole('textbox', { name: 'Name box' })
  await name.fill('A1:B4'); await name.press('Enter')
  await showRibbonItem(scope, 'data.worksheet-filter')
  await scope.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await scope.getByRole('button', { name: 'Filter column A', exact: true }).click()
  await scope.getByRole('button', { name: 'Top / Bottom…', exact: true }).click()
}

test('rank drafts and native results are isolated between two spreadsheet instances', async ({ page }) => {
  await mount(page)
  const first = page.locator('#first'); const second = page.locator('#second')
  await open(first)
  await first.getByLabel('Rank amount 1', { exact: true }).fill('1')
  await first.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveCount(0)
  await expect(first.locator('td[data-cell="2:1"]')).toHaveText('A3')
  await expect(second.locator('td[data-cell="1:1"]')).toHaveText('B1')
  await open(second)
  await expect(second.getByLabel('Rank amount 1', { exact: true })).toHaveValue('10')
  await second.getByRole('button', { name: 'Cancel', exact: true }).click()
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveText('A1')
  await expect(second.locator('td[data-cell="3:1"]')).toHaveText('B2')
})

test('uninstalling the condition editor preserves the active typed draft through Apply', async ({ page }) => {
  await mount(page)
  const first = page.locator('#first')
  await open(first); await first.getByLabel('Rank amount 1', { exact: true }).fill('1')
  await page.keyboard.press('Alt+u')
  await expect(page.locator('#host-event')).toHaveText('uninstalled')
  await expect(first.getByLabel('Rank amount 1', { exact: true })).toHaveCount(0)
  await expect(first.getByText('This saved condition is preserved. Enable its plugin to edit it.')).toBeVisible()
  await first.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(first.getByRole('dialog')).toHaveCount(0)
  await expect(first.locator('td[data-cell="1:1"]')).toHaveCount(0)
  await expect(first.locator('td[data-cell="2:1"]')).toHaveText('A3')
  await expect(first.locator('td[data-cell="3:1"]')).toHaveCount(0)
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveText('A1')
})
