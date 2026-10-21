// Full browser → HTTP API → isolated SQLite flow; fake provider in the test server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {session,VIEWPORTS} from '../scripts/ui_cdp_v762.mjs';
const [base,run,wallet,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
await session(async page=>{
 // The page scrolls smoothly to the next consent; click only once scrolling has stopped.
 const settle=async()=>{for(let y=-1,i=0;i<40;i++){const now=await page.eval('scrollY');if(now===y)return;y=now;await new Promise(r=>setTimeout(r,150));}};
 await page.viewport(VIEWPORTS.desktop);
 await page.go(base+'/');await page.eval(`localStorage.removeItem('hfl-manager-cost')`); // the Chrome profile outlives a run
 await page.go(base+'/radar?'+new URLSearchParams({run,wallet})+'#analysis-results');
 assert.equal(await page.eval(`document.querySelector('#wallet-manager').hidden`),false);
 // The fixture's proposal is prepared but not run: its (free) cost estimate opens by itself.
 for(let i=0;i<100;i++){
  if(await page.eval(`!document.querySelector('#manager-inference').hidden`))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(await page.eval(`document.activeElement.id`),'manager-paid'); // the next decision is in focus
 // cycle view: the paid manager consent is the step waiting for Lucas
 assert.equal(await page.eval(`document.querySelector('#agent-cycle [data-node="manager"]').dataset.state`),'you');
 assert.equal(await page.eval(`document.querySelector('#agent-cycle [data-node="manager"]').querySelector('button').getAttribute('aria-current')`),'step');
 assert.equal(await page.eval(`document.querySelector('#cycle-next').textContent.startsWith('Aguardando você em Gestor')`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-cost').value`),''); // no cost rate invented
 await page.eval(`document.querySelector('#manager-cost').value='0.10';document.querySelector('#manager-cost').dispatchEvent(new Event('input',{bubbles:true}));`);
 assert.equal(await page.eval(`document.querySelector('#manager-inference').hidden`),true); // editing drops the consent
 await page.click('#manager-prepare');
 for(let i=0;i<100;i++){
  if(await page.eval(`!document.querySelector('#manager-inference').hidden`))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(await page.eval(`document.querySelector('#manager-run').disabled`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-estimate').textContent.includes('Uma chamada')`),true);
 await settle();await page.click('#manager-paid');await page.click('#manager-run');
 for(let i=0;i<100;i++){
  if(await page.eval(`!document.querySelector('#manager-result').hidden`))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(await page.eval(`document.querySelector('#manager-result').hidden`),false);
 assert.equal(await page.eval(`document.querySelector('#manager-plan').textContent.includes('redução parcial')`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-price-note').textContent.includes('Não é cotação ao vivo')`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-plan').textContent.includes('Vender 4 ações')`),true);
 // the (free) preview opens by itself once the plan is approvable
 for(let i=0;i<100;i++){
  if(await page.eval(`!document.querySelector('#manager-preview-box').hidden`))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(await page.eval(`document.querySelector('#manager-apply').disabled`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-quotes').textContent.includes('Preço de decisão')`),true); // DP-33 quote table
 assert.equal(await page.eval(`document.querySelector('#manager-stale').hidden`),true); // no stale alert without a base
 await page.eval(`document.querySelector('#manager-financial').focus()`);await page.key(' ');
 assert.equal(await page.eval(`document.querySelector('#manager-apply').disabled`),false);
 await page.click('#manager-apply');
 for(let i=0;i<100;i++){
  if(await page.eval(`document.querySelector('#manager-receipt').textContent.includes('Ordem aprovada')`))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(await page.eval(`document.querySelector('#manager-receipt').textContent.includes('Ordem aprovada')`),true);
 await page.shot(out+'/manager-desktop.png',true);
 assert.equal(await page.eval(`document.querySelector('#agent-cycle [data-node="approval"]').dataset.state`),'done');
 assert.equal(await page.eval(`document.querySelector('#agent-cycle [data-node="auction"]').dataset.state`),'waiting'); // order waits for the official auction
 await page.eval('scrollTo(0,0)');await page.shot(out+'/cycle-desktop.png');
 await page.viewport(VIEWPORTS.phone);
 await page.go(base+'/radar?'+new URLSearchParams({run,wallet})+'#analysis-results');
 assert.equal(await page.eval(`document.querySelector('#manager-receipt').textContent.includes('Ordem aprovada')`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-approval').hidden`),true);
 assert.equal(await page.eval(`document.querySelector('#manager-cost').value`),'0.10'); // cost rate remembered
 assert.equal(await page.eval(`document.documentElement.scrollWidth <= innerWidth + 1`),true);
 await page.shot(out+'/manager-phone.png',true);
 await page.eval(`document.querySelector('#agent-cycle').scrollIntoView()`);await page.shot(out+'/cycle-phone.png');
 await page.click('#agent-cycle [data-node="data"] button'); // a step opens its own controls
 await new Promise(r=>setTimeout(r,400));
 assert.equal(await page.eval(`document.querySelector('[data-agent-screen="workflow"]').hidden`),false);
 assert.equal(await page.eval(`document.documentElement.scrollWidth <= innerWidth + 1`),true);
 await page.go(base+'/operations?'+new URLSearchParams({wallet}));
 assert.equal(await page.eval(`document.querySelectorAll('#personal-trades tbody tr').length`),1); // pending order: no trade until the official auction price exists
 assert.deepEqual(page.console,[]);
 console.log('PASS: cycle view (manager consent waiting, auction wait, step opens its screen), remembered cost auto-prepares, focus on paid consent, separate paid consent, auto preview, fake durable inference, partial sizing, financial preview/keyboard consent, pending auction order (no trade yet), reload/history; desktop/phone');
});
