// DP-28 comparison view: cumulative-return chart + wallet table; GET only, every other request blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {session,VIEWPORTS} from '../scripts/ui_cdp_v762.mjs';
const [base,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const catalog=await(await fetch(base+'/api/portfolio/manual')).json();
const grouped=catalog.wallets.filter(w=>w.comparison_group);
assert.ok(grouped.length>=2,'needs two grouped wallets');
const mock=process.env.MOCK_BENCH==='1'; // ponytail: synthetic rows only exercise the render path when the endpoint is absent
const bench=mock||await fetch(base+'/api/platform/market-base/benchmark?since='+grouped[0].start_date).then(async r=>r.ok&&(await r.json()).rows?.length>0,()=>false);
await session(async page=>{
 const blocked=[];
 page.listeners.push(m=>{
  if(m.method!=='Fetch.requestPaused')return;
  const {request,requestId}=m.params;
  // The home's DP-26 intraday collection must not reach Yahoo: answer it locally.
  if(request.method==='POST'&&request.url===base+'/api/portfolio/stock-history/intraday/refresh')
   return page.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({identity:'HFL-STOCK-INTRADAY-YAHOO-V1',refresh_errors:{}})).toString('base64')});
  if(mock&&request.url.includes('/market-base/benchmark'))return page.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({anchor:'2026-10-13',rows:[['2026-10-13',100],['2026-10-14',101],['2026-10-15',99],['2026-10-16',102]].map(([date,close])=>({date,close}))})).toString('base64')});
  const safe=request.method==='GET'&&new URL(request.url).origin===base;
  if(!safe)blocked.push(request.url);
  page.send(safe?'Fetch.continueRequest':'Fetch.failRequest',safe?{requestId}:{requestId,errorReason:'BlockedByClient'});
 });
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 for(const size of ['desktop','phone']){
  await page.viewport(VIEWPORTS[size]);await page.go(base+'/comparison?wallet='+grouped[0].id);
  for(let i=0;i<150;i++){
   if(await page.eval(`Boolean(window.Chart?.getChart('cmp-chart'))&&document.querySelectorAll('#product-comparison tbody tr').length>0`))break;
   await new Promise(r=>setTimeout(r,100));
  }
  const sets=await page.eval(`Chart.getChart('cmp-chart').data.datasets.map(d=>({label:d.label,first:d.data[0],dash:Boolean(d.borderDash),gaps:d.spanGaps}))`);
  const wallets=sets.filter(s=>!s.dash);
  assert.ok(wallets.length>=2);assert.ok(wallets.every(s=>s.first===0&&s.gaps===false));
  assert.equal(sets.some(s=>s.dash),bench,'IBOV dataset iff benchmark endpoint has rows');
  assert.equal(await page.eval(`Chart.getChart('cmp-chart').data.labels[0].startsWith('Início · ')`),true);
  const note=await page.eval(`document.querySelector('#cmp-note').textContent`);
  assert.match(note,/não indica superioridade/);assert.match(note,bench?/ancorada no fechamento de \d\d\/\d\d/:/Ibovespa indisponível/);
  assert.equal(await page.eval(`document.querySelectorAll('#product-comparison tbody tr').length`),catalog.wallets.length+(bench?1:0));
  assert.equal(await page.eval(`document.querySelectorAll('#cmp-table tbody tr').length`),await page.eval(`Chart.getChart('cmp-chart').data.labels.length`));
  assert.match(await page.eval(`document.querySelector('#personal-subtitle').textContent`),/Compare a trajetória/);
  assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true);
  console.log(size,'|',note,'|',await page.eval(`[...document.querySelectorAll('#product-comparison tbody tr')].map(r=>[...r.cells].map(c=>c.textContent).join(' ; ')).join('\\n')`));
  await page.shot(out+'/'+size+'-comparison.png',true);
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(page.console,[]);
 console.log('PASS: comparison chart from 0%, '+(bench?'with':'without')+' Ibovespa, table rows, neutral note, no overflow; GET only.');
});
