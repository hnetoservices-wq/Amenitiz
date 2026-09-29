const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
const selector = '[class*="inventory-controls__rate-plan-selector___"]';
const fixture = new JSDOM(fs.readFileSync(process.argv[2], 'utf8'));
const html = fixture.window.document.querySelector(selector).outerHTML;
fixture.window.close();
const wait = () => new Promise(resolve => setTimeout(resolve, 60));
(async () => {
  const dom = new JSDOM(html, {url:'https://test.amenitiz.io/pt/admin/inventory', runScripts:'outside-only', pretendToBeVisual:true});
  const {document:d} = dom.window;
  const key = 'rate-order:v1:test.amenitiz.io';
  const saved = ['143854','206455','206456','206457','206508','206509','147900'];
  let storageChanged;
  dom.window.chrome = {storage:{local:{get:async()=>({[key]:saved}),set:async()=>{}},onChanged:{addListener:fn=>storageChanged=fn}}};
  const originalNodes = [...d.querySelectorAll('[data-option]')];
  let clicked;
  originalNodes.forEach(node=>node.addEventListener('click',()=>clicked=node.dataset.option));
  const originalIds = originalNodes.map(node=>node.dataset.option);
  const visual = () => [...d.querySelectorAll(`${selector} [data-option]`)].sort((a,b)=>Number(a.parentElement.style.order)-Number(b.parentElement.style.order));
  dom.window.eval(code); await wait();
  assert.deepEqual(visual().map(node=>node.dataset.option),saved);
  assert.deepEqual([...d.querySelectorAll('[data-option]')],originalNodes,'React node order is unchanged');
  visual().at(-1).click(); assert.equal(clicked,'147900');
  assert.equal(d.querySelector('[data-is-selected="true"]').dataset.option,'143854');
  visual()[0].focus();
  function press(key, shiftKey=false) { d.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true})); }
  press('ArrowDown'); assert.equal(d.activeElement.dataset.option,'206455');
  press('End'); assert.equal(d.activeElement.dataset.option,'147900');
  press('ArrowUp'); assert.equal(d.activeElement.dataset.option,'206509');
  press('Tab'); assert.equal(d.activeElement.dataset.option,'147900');
  press('Tab',true); assert.equal(d.activeElement.dataset.option,'206509');
  // Cross-tab updates use only this property's key.
  storageChanged({'rate-order:v1:other.amenitiz.io':{newValue:[]}},'local');
  assert.deepEqual(visual().map(node=>node.dataset.option),saved);
  storageChanged({[key]:{newValue:[]}},'local');
  assert.deepEqual(visual().map(node=>node.dataset.option),originalIds);
  assert.equal(d.querySelectorAll('.amr-rate-options').length,0);
  storageChanged({[key]:{newValue:saved}},'local');
  // Reopening the dropdown remounts its options.
  const list=originalNodes[0].parentElement.parentElement;
  const replacement=list.cloneNode(true);
  replacement.classList.remove('amr-rate-options');
  [...replacement.children].forEach(child=>child.style.order='');
  list.replaceWith(replacement); await wait();
  assert.deepEqual(visual().map(node=>node.dataset.option),saved);
  const added=replacement.firstElementChild.cloneNode(true);
  added.firstElementChild.dataset.option='999999'; replacement.append(added); await wait();
  assert.equal(visual().at(-1).dataset.option,'999999');
  // Unrelated dropdowns are not touched, even with overlapping IDs.
  const unrelated=d.createElement('div'); unrelated.innerHTML='<div><div data-testid="dropdown-item" data-option="147900">Unrelated</div></div>';
  d.body.append(unrelated); await wait(); assert.equal(unrelated.firstElementChild.style.order,'');
  dom.window.close();
  console.log('PASS: supplied inventory dropdown; Airbnb last; preserved nodes, click handler and selection; keyboard; cross-tab sync; reset; reopen; unknown rates; unrelated dropdown isolation.');
})().catch(error=>{console.error(error);process.exit(1);});
