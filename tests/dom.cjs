const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2],'utf8');
const html = source.match(/<div data-react-class="RatePlans\/index"[\s\S]*?<\/table>/)[0];
const code = fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8');
const data = {};
const pause = () => new Promise(resolve=>setTimeout(resolve,50));
async function mount(host='test.amenitiz.io') {
  const dom = new JSDOM(html,{url:`https://${host}/pt/admin/pricing_types`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.chrome = {storage:{local:{get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value)}}};
  dom.window.eval(code); await pause(); return dom;
}
(async()=>{
  let dom = await mount(); let d = dom.window.document;
  const seq = () => [...d.querySelectorAll('tr[data-testid^="rate-plan-row-"]')].sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(row=>row.dataset.testid);
  const original = seq(); assert.equal(original.length,7);
  const click = text => [...d.querySelectorAll('.amr-toolbar button')].find(b=>b.textContent===text).click();
  click('Z → A'); await pause(); const sorted=seq(); assert.notDeepEqual(sorted,original);
  dom.window.close(); dom=await mount(); d=dom.window.document; assert.deepEqual(seq(),sorted);
  d.querySelector(`[data-testid="${sorted[0]}"] .amr-handle`).dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));
  await pause(); assert.equal(seq()[1],sorted[0]);
  const before=seq(); const from=d.querySelector(`[data-testid="${before.at(-1)}"]`), to=d.querySelector(`[data-testid="${before[0]}"]`);
  const transfer={setData(){},setDragImage(){}};
  function drag(target,type){const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{dataTransfer:{value:transfer},clientY:{value:-1}});target.dispatchEvent(event);}
  drag(from.querySelector('.amr-handle'),'dragstart');drag(to,'dragover');drag(to,'drop');await pause();assert.equal(seq()[0],before.at(-1));
  click('Ordem original'); await pause(); assert.deepEqual(seq(),original);
  const body=d.querySelector('tbody'); const row=body.firstElementChild.cloneNode(true);row.querySelector('.amr-handle').remove();row.dataset.testid='rate-plan-row-999999';body.append(row);await pause();assert.equal(d.querySelectorAll('.amr-handle').length,8);assert.equal(seq().at(-1),'rate-plan-row-999999');
  assert.equal(d.querySelectorAll('.amr-toolbar').length,1);
  d.querySelector('[data-react-class]').remove();await pause();assert.equal(d.querySelectorAll('.amr-toolbar').length,0);
  dom.window.close();dom=await mount('other.amenitiz.io');d=dom.window.document;assert.deepEqual(seq(),original);
  dom.window.close();console.log('PASS: supplied 7 rates, sorting, persistence, keyboard move, drag/drop logic, reset, new rates, toolbar cleanup, property isolation.');
})().catch(error=>{console.error(error);process.exit(1);});
