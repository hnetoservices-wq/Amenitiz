const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../extension/inventory.js'),'utf8');
function fixture(file){const dom=new JSDOM(fs.readFileSync(file,'utf8'));const room=dom.window.document.querySelector('[data-testid="inventory-room-calendar"]');const html=room.outerHTML;dom.window.close();return html;}
const closed=fixture(process.argv[2]),opened=fixture(process.argv[3]);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 for(const [html,expected] of [[closed,2],[opened,0]]){
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});const d=dom.window.document;
  const room=d.querySelector('[data-testid="inventory-room-calendar"]'),heading=room.querySelector('[data-testid="min-max-stay-row"]');
  room.getClientRects=()=>[{}];room.querySelector('[data-testid="min-stay-row"]').getBoundingClientRect=()=>({height:40});
  let clicks=0;
  const icon=heading.querySelector('[data-testid="expand-icon"]');
  icon.addEventListener('click',()=>{
   clicks++;
   if(clicks===1)return; // Simulate a first click before the app is ready.
   heading.classList.add('styles-module__row--open___J18ee');
   icon.querySelector('[title]').title='arrows/chevron-up';
  });
  dom.window.eval(code);await pause(850);
  assert.equal(clicks,expected);
  assert.ok(heading.className.includes('__row--open___'));
  // Subsequent user collapse must not be reversed by later page updates.
  heading.classList.remove('styles-module__row--open___J18ee');icon.querySelector('[title]').title='arrows/chevron-down';
  d.body.append(d.createElement('i'));await pause(100);assert.equal(clicks,expected);
  dom.window.close();
 }
 console.log('PASS: supplied closed/open snapshots; nonzero collapsed height; retry after ignored click; already-open section untouched; manual collapse preserved.');
})().catch(error=>{console.error(error);process.exit(1);});
