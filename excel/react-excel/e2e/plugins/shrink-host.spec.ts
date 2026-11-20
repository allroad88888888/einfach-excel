import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { expectShrinkFits, shrinkText } from '../support/shrink-to-fit'

const plugin = `/@fs${fileURLToPath(new URL('../../../../plugins/plugin-text-format/src/index.tsx', import.meta.url))}`

test('shrink belongs to one plugin instance while uninstall preserves the shared workbook facts', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.route('**/shrink-plugin-hosts', route => route.fulfill({
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
      const {textFormatPlugin}=await import(${JSON.stringify(plugin)});
      const definition=tag=>({title:tag,sheets:[{id:'s',name:tag,rowCount:40,colCount:5}],
        createImportChunks:()=>[[{sheet:0,row:0,col:0,kind:'text',
          value:tag+' long inventory 2026-000000123456',format:{fontSize:20}}]]});
      const first=createRoot(document.getElementById('first'));
      const source=definition('First');let installed=true;
      const render=()=>first.render(React.createElement(Spreadsheet,{definition:source,
        plugins:installed?[textFormatPlugin]:[],locale:'en',style:{height:'100%'}}));
      render();
      createRoot(document.getElementById('second')).render(React.createElement(Spreadsheet,{
        definition:definition('Second'),plugins:[textFormatPlugin],locale:'en',style:{height:'100%'}}));
      document.addEventListener('keydown',event=>{
        if(event.altKey&&event.code==='KeyU') {
          event.preventDefault();installed=!installed;render();
          document.getElementById('host-event').textContent=installed?'installed':'uninstalled';
        }
      });
    </script></body></html>`,
  }))
  await page.goto('/shrink-plugin-hosts')
  const first = page.locator('#first'), second = page.locator('#second')
  const a = first.locator('td[data-cell="0:0"]'), b = second.locator('td[data-cell="0:0"]')
  await expect(a).toContainText('First long inventory')
  await expect(b).toContainText('Second long inventory')
  await showRibbonItem(first, 'format.shrink-to-fit')
  await first.getByRole('button', { name: 'Shrink to fit', exact: true }).click()
  const before = await expectShrinkFits(a)
  await expect(shrinkText(b)).toHaveCount(0)
  await expect(second.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.keyboard.press('Alt+u')
  await expect(page.locator('#host-event')).toHaveText('uninstalled')
  await expect(first.getByRole('button', { name: 'Shrink to fit', exact: true })).toHaveCount(0)
  const retained = await expectShrinkFits(a)
  expect(retained.width).toBeCloseTo(before.width, 1)
  await page.keyboard.press('Alt+u')
  await showRibbonItem(first, 'format.shrink-to-fit')
  await expect(first.getByRole('button', { name: 'Shrink to fit', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(shrinkText(a)).toHaveCount(0)
  await expect(first.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(b).toContainText('Second long inventory')
})
