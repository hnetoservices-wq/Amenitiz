const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=new JSDOM(fs.readFileSync(process.argv[2],'utf8'));
const html=[...source.window.document.querySelectorAll('[data-testid="inventory-room-calendar"]')].map(el=>el.outerHTML).join('');
source.window.close();
const wait=()=>new Promise(resolve=>setTimeout(resolve,70));
(async()=>{
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  const d=dom.window.document;
  const css=d.createElement('style');css.textContent=fs.readFileSync(path.join(__dirname,'../extension/content.css'),'utf8');d.head.append(css);
  const rooms=[...d.querySelectorAll('[data-testid="inventory-room-calendar"]')];assert.equal(rooms.length,4);
  const original=rooms.map(room=>[...room.querySelector('[data-testid="min-max-stay-row"]').parentElement.children]);
  const clicks=new Map();
  function wire(room, expanded=false){
    room.getClientRects=()=>[{}];
    const heading=room.querySelector('[data-testid="min-max-stay-row"]');
    const detail=room.querySelector('[data-testid="min-stay-row"]');
    detail.getBoundingClientRect=()=>({height:expanded?40:0});
    heading.querySelector('[data-testid="header"]').addEventListener('click',()=>{expanded=!expanded;clicks.set(room,(clicks.get(room)||0)+1);const marker=d.createElement('i');heading.append(marker);marker.remove();});
  }
  rooms.forEach((room,index)=>wire(room,index===1));
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../extension/inventory.js'),'utf8'));await wait();await wait();
  rooms.forEach((room,index)=>{
    const grid=room.querySelector('.amr-inventory-grid');assert.ok(grid);
    assert.deepEqual([...grid.children],original[index],'React DOM order retained');
    const visible=[...grid.children].sort((a,b)=>Number(a.style.order)-Number(b.style.order)).filter(el=>el.dataset.testid&&dom.window.getComputedStyle(el).display!=='none').map(el=>el.dataset.testid);
    assert.deepEqual(visible,['date-cols','availability-row','current-booked-rooms-row','price-row','min-max-stay-row','min-stay-row','max-stay-row','rate-restrictions-row','closed-to-arrival-row','closed-to-departure-row','closed-rate-row']);
    assert.equal(clicks.get(room)||0,index===1?0:1);
  });
  // User collapse is respected for the rest of this mounted calendar's visit.
  rooms[0].querySelector('[data-testid="min-max-stay-row"] [data-testid="header"]').click();await wait();assert.equal(clicks.get(rooms[0]),2);
  // A freshly mounted room (navigation/reload) expands again.
  const fresh=rooms[0].cloneNode(true);wire(fresh);rooms[0].replaceWith(fresh);await wait();assert.equal(clicks.get(fresh),1);
  assert.equal(dom.window.getComputedStyle(fresh.querySelector('[data-testid="smart-pricing-row"]')).display,'none');
  dom.window.close();console.log('PASS: four rooms; recommendation rows hidden; complete section groups swapped; collapsed sections opened once; already-open sections preserved; manual collapse and remount handled.');
})().catch(error=>{console.error(error);process.exit(1);});
