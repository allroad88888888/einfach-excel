import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { chooseColor, colorFilterFile } from '../support/color-filter'
import { button, cell, dialog, enable } from '../support/date-filter'

const plugin = `/@fs${fileURLToPath(new URL('../../../../plugins/plugin-data-filter/src/index.tsx', import.meta.url))}`

async function mount(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.route('**/color-candidate-pending', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0"><div id="host" style="height:850px"></div><script type="module">
      import Refresh from '/@react-refresh'; Refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const {Spreadsheet}=await import('/src/index.ts');
      const {createDefaultWorkbookWorker}=await import('/src/worker/create-workbook-worker.ts');
      const {dataFilterPlugin}=await import(${JSON.stringify(plugin)});
      const pending=[];
      let hold=true;
      document.documentElement.dataset.pendingColors='0';
      document.addEventListener('keydown',event=>{
        if(!event.altKey||event.code!=='KeyR')return;
        event.preventDefault();
        hold=false;
        pending.splice(0).forEach(deliver=>deliver());
        document.documentElement.dataset.pendingColors=String(pending.length);
      });
      function workerFactory() {
        const worker=createDefaultWorkbookWorker(), requests=new Set(), listeners=new Set();
        worker.addEventListener('message',event=>{
          const recipients=[...listeners];
          const deliver=()=>recipients.forEach(listener=>listener(event));
          if(requests.delete(event.data?.id)&&hold){
            pending.push(deliver);
            document.documentElement.dataset.pendingColors=String(pending.length);
          }else deliver();
        });
        return {
          postMessage(message){
            if(message.command==='sheet.filterValues'&&message.payload.colorSource)requests.add(message.id);
            worker.postMessage(message);
          },
          addEventListener(type,listener){
            if(type==='message')listeners.add(listener);else worker.addEventListener(type,listener);
          },
          removeEventListener(type,listener){
            if(type==='message')listeners.delete(listener);else worker.removeEventListener(type,listener);
          },
          terminate(){worker.terminate();}
        };
      }
      const definition={title:'Color candidate timing',sheets:[{
        id:'colors',name:'Colors',rowCount:70,colCount:8}],createImportChunks:()=>[]};
      createRoot(document.getElementById('host')).render(React.createElement(Spreadsheet,{
        definition,workerFactory,initialSnapshot:${JSON.stringify(colorFilterFile().toString())},
        plugins:[dataFilterPlugin],locale:'en',style:{height:'100%'},
      }));
    </script></body></html>`,
  }))
  await page.goto('/color-candidate-pending')
  await expect(cell(page, '1:1')).toHaveText('Red solid')
  await enable(page, 'A1:B8')
}

test('Pending color candidates can be closed without a late update', async ({ page }) => {
  await mount(page)
  await chooseColor(page, 'fill')
  await button(page, 'Choose a color from this column').click()
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-pending-colors', '1')
  await expect(dialog(page).getByRole('status')).toHaveText('Loading column colors…')
  await button(page, 'Hide column colors').click()
  await page.keyboard.press('Alt+r')
  await expect(root).toHaveAttribute('data-pending-colors', '0')
  await expect(button(page, 'Choose a color from this column')).toHaveAttribute('aria-expanded', 'false')
  await expect(button(page, '#c00000 (2 rows)')).toHaveCount(0)
  await button(page, 'Choose a color from this column').click()
  await expect(button(page, '#c00000 (2 rows)')).toBeVisible()
  await expect(button(page, 'No fill')).toHaveAttribute('aria-pressed', 'true')
  await expect(cell(page, '1:1')).toHaveText('Red solid')
  await expect(cell(page, '2:1')).toHaveText('Pattern')
})
