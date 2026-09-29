const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/*', route => route.abort());
  let html = fs.readFileSync(process.argv[2], 'utf8');
  // Extract just the rate table; never execute scripts from an account export.
  html = html.match(/<div data-react-class="RatePlans\/index"[\s\S]*?<\/table>/)[0] + '</div></div></div></div></div>';
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const code = fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8');
  const css = fs.readFileSync(path.join(__dirname,'../extension/content.css'),'utf8');
  let stored = {};
  await page.exposeFunction('saveStorage', data => { Object.assign(stored,data); });
  async function mount(data = stored) {
    await page.goto('about:blank');
    await page.setContent('<html lang="pt"><body>'+html+'</body></html>');
    await page.evaluate(data => { window.chrome = {storage:{local:{get:async()=>data,set:async value=>window.saveStorage(value)}}}; }, data);
    await page.addStyleTag({content:css});
    await page.addScriptTag({content:code});
    await page.waitForSelector('.amr-handle');
  }
  const sequence = () => page.locator('tr[data-testid^="rate-plan-row-"]').evaluateAll(rows => rows.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(row=>row.dataset.testid));
  await mount();
  const original = await sequence();
  assert.equal(original.length,7);
  await page.getByRole('button',{name:'Z → A',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.amr-status').textContent === 'Ordem guardada');
  const sorted = await sequence(); assert.notDeepEqual(sorted,original);
  await mount(); assert.deepEqual(await sequence(),sorted);
  // Keyboard moves the focused rate without triggering any native controls.
  await page.locator(`[data-testid="${sorted[0]}"] .amr-handle`).focus();
  await page.keyboard.press('Alt+ArrowDown');
  const moved = await sequence(); assert.equal(moved[1],sorted[0]);
  // Native HTML drag/drop events exercise transfer, hit position and persistence.
  await page.evaluate(({source,target}) => {
    const row = document.querySelector(`[data-testid="${source}"]`);
    const dest = document.querySelector(`[data-testid="${target}"]`);
    const dt = new DataTransfer();
    row.querySelector('.amr-handle').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
    const box = dest.getBoundingClientRect();
    dest.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:box.top+1}));
    dest.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:box.top+1}));
  },{source:moved.at(-1),target:moved[0]});
  assert.equal((await sequence())[0],moved.at(-1));
  await page.getByRole('button',{name:'Ordem original',exact:true}).click();
  assert.deepEqual(await sequence(),original);
  // React-like row replacement and insertion are picked up without duplicates.
  await page.evaluate(() => {
    const body = document.querySelector('.amr-table tbody');
    const replacement = body.firstElementChild.cloneNode(true);
    replacement.querySelector('.amr-handle').remove();
    body.firstElementChild.replaceWith(replacement);
    const added = replacement.cloneNode(true); added.dataset.testid='rate-plan-row-999999';
    body.append(added);
  });
  await page.waitForFunction(()=>document.querySelectorAll('.amr-handle').length===8);
  assert.equal((await sequence()).at(-1),'rate-plan-row-999999');
  assert.equal(await page.locator('.amr-toolbar').count(),1);
  await page.evaluate(()=>document.querySelector('[data-react-class]').remove());
  await page.waitForFunction(()=>!document.querySelector('.amr-toolbar'));
  // Different property key does not consume another property's preferences.
  await mount({'rate-order:v1:other.amenitiz.io':['206509','143854']});
  assert.deepEqual(await sequence(),original);
  console.log('PASS: 7 supplied rates; sort; persistence; keyboard; drag/drop; reset; row replacement/addition; navigation cleanup; property isolation.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
