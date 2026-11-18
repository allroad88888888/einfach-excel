import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const plugin = `/@fs${fileURLToPath(new URL('../../../../plugins/plugin-cell-appearance/src/index.ts', import.meta.url))}`

test('pattern plugin reinstall restores its draft while formats and hosts stay independent', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.route('**/pattern-plugin-hosts', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0"><div id="first" style="height:520px"></div>
    <div id="second" style="height:520px"></div><output id="host-event"></output>
    <script type="module">
      import Refresh from '/@react-refresh'; Refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const {Spreadsheet}=await import('/src/index.ts');
      const {cellAppearancePlugin}=await import(${JSON.stringify(plugin)});
      const definition=tag=>({title:tag,sheets:[{id:'s',name:tag,rowCount:40,colCount:5}],
        createImportChunks:()=>[[{sheet:0,row:0,col:0,kind:'text',value:tag}]]});
      const first=createRoot(document.getElementById('first'));
      const source=definition('First');let installed=true;
      const render=()=>first.render(React.createElement(Spreadsheet,{definition:source,
        plugins:installed?[cellAppearancePlugin]:[],locale:'en',style:{height:'100%'}}));
      render();
      createRoot(document.getElementById('second')).render(React.createElement(Spreadsheet,{
        definition:definition('Second'),plugins:[cellAppearancePlugin],locale:'en',style:{height:'100%'}}));
      document.addEventListener('keydown',event=>{
        if(event.altKey&&event.code==='KeyU') {
          event.preventDefault();installed=!installed;render();
          document.getElementById('host-event').textContent=installed?'installed':'uninstalled';
        }
      });
    </script></body></html>`,
  }))
  await page.goto('/pattern-plugin-hosts')
  const first = page.locator('#first'), second = page.locator('#second')
  const a = first.locator('td[data-cell="0:0"]'), b = second.locator('td[data-cell="0:0"]')
  await expect(a).toHaveText('First'); await expect(b).toHaveText('Second')
  await showRibbonItem(first, 'format.pattern-fill')
  await first.getByRole('button', { name: 'Pattern fill', exact: true }).click()
  await page.getByLabel('Pattern', { exact: true }).selectOption('darkUp')
  await page.getByLabel('Pattern color').fill('#c00000')
  await page.getByLabel('Background color').fill('#fff2cc')
  await page.keyboard.press('Alt+u')
  await expect(page.locator('#host-event')).toHaveText('uninstalled')
  await expect(first.getByRole('dialog')).toHaveCount(0)
  await expect(a).toHaveCSS('background-image', 'none')
  await expect(second.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Alt+u')
  await expect(page.getByLabel('Pattern', { exact: true })).toHaveValue('darkUp')
  await expect(page.getByLabel('Pattern color')).toHaveValue('#c00000')
  await page.getByRole('button', { name: 'Apply fill', exact: true }).click()
  await expect(a).toHaveCSS('background-image', /data:image\/svg\+xml/)
  const image = await a.evaluate(node => getComputedStyle(node).backgroundImage)
  await expect(b).toHaveCSS('background-image', 'none')
  await expect(second.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.keyboard.press('Alt+u')
  await expect(first.getByRole('button', { name: 'Pattern fill', exact: true })).toHaveCount(0)
  await expect(a).toHaveCSS('background-image', image)
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(a).toHaveCSS('background-image', 'none')
  await expect(first.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
