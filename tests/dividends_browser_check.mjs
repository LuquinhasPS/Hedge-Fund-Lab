// DP-30 proventos page + home hooks. GET-only; the home's DP-26 intraday POST is refused, never sent to Yahoo.
// MOCK_DIVIDENDS=1 appends a SYNTHETIC `dividends` block to the history response (TEST-ONLY, populated-path coverage).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {session, VIEWPORTS} from '../scripts/ui_cdp_v762.mjs';
const [base,out]=process.argv.slice(2),mock=process.env.MOCK_DIVIDENDS==='1';
fs.mkdirSync(out,{recursive:true});
const wallet=(await(await fetch(base+'/api/portfolio/manual')).json()).wallets[0].id;
const real=await(await fetch(base+'/api/portfolio/history?wallet='+wallet)).json();
const fake={source:'B3 — proventos em dinheiro',fetched_at:'2026-10-17T14:30:00-03:00',received:'12.50',receivable:'30.00',announced:'8.00',events:[
 {ticker:'PETR4',kind:'JCP',data_com:'2026-09-01',payment_date:'2026-09-30',value_per_share:'0.125',quantity:'100',gross:'12.50',net:'12.50',state:'RECEBIDO',estimate:false},
 {ticker:'VALE3',kind:'DIVIDENDO',data_com:'2026-10-05',payment_date:'2026-10-30',value_per_share:'0.30',quantity:'100',gross:'30.00',net:'30.00',state:'A_RECEBER',estimate:false},
 {ticker:'ITUB4',kind:'DIVIDENDO',data_com:'2026-10-10',payment_date:null,value_per_share:'0.08',quantity:'100',gross:'8.00',net:'8.00',state:'PREVISTO',estimate:true}]};
const withMock=h=>({...h,dividends:fake,valuation:{...h.valuation,dividends_received:'12.50',dividends_receivable:'30.00',cash_available:String(Number(h.valuation.cash)+12.5)},
 daily_history:h.daily_history.map(p=>({...p,dividends_received:'12.50',dividends_receivable:'30.00'}))});
const hasReal=Boolean(real.dividends);
await session(async page=>{
 const blocked=[];
 page.listeners.push(async m=>{
  if(m.method!=='Fetch.requestPaused')return;
  const {request,requestId}=m.params,u=new URL(request.url);
  const done=(code,body)=>page.send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
  if(u.pathname==='/api/portfolio/stock-history/intraday/refresh')return page.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
  if(mock&&request.method==='GET'&&u.origin===base&&u.pathname==='/api/portfolio/history'){
   const h=await(await fetch(request.url)).json();return done(200,h.wallet?withMock(h):h);
  }
  const safe=request.method==='GET'&&u.origin===base;
  if(!safe)blocked.push(request.method+' '+request.url);
  page.send(safe?'Fetch.continueRequest':'Fetch.failRequest',safe?{requestId}:{requestId,errorReason:'BlockedByClient'});
 });
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 const wait=async js=>{for(let i=0;i<150&&!await page.eval(js);i++)await new Promise(r=>setTimeout(r,100));};
 const text=sel=>page.eval(`document.querySelector(${JSON.stringify(sel)}).textContent`);
 for(const size of ['desktop','phone']){
  await page.viewport(VIEWPORTS[size]);
  await page.go(base+'/dividends?wallet='+wallet);
  await wait(`!/Conferindo/.test(document.querySelector('#div-status').textContent)`);
  assert.equal(await page.eval(`document.querySelectorAll('#div-tiles .ds-kpi').length`),3);
  const tiles=await text('#div-tiles'),status=await text('#div-status');
  console.log(size,'|',tiles,'|',status,'|',await text('#div-table'),'|',await text('#div-note'));
  if(mock||hasReal){
   assert.doesNotMatch(tiles,/Indisponível/);
   if(mock||real.dividends.events.length){
    assert.ok(await page.eval(`document.querySelectorAll('#div-table tbody tr').length>0`));
    assert.match(await text('#div-table'),/Recebido|A receber|Anunciado/);
    assert.match(await text('#div-note'),/Fonte: B3 \(proventos em dinheiro\), (consultada em \d\d\/\d\d \d\d:\d\d|consulta ainda não registrada)\..*DP-30/);
   }else assert.match(status,/Nenhum provento desde o início da carteira\./);
  }else{
   assert.match(tiles,/integração de proventos indisponível/);assert.match(status,/Integração de proventos indisponível/);
   assert.doesNotMatch(tiles,/R\$\s*0,00/);
  }
  if(mock){
   assert.match(await text('#div-table'),/JCP líquido \(15% IR\)/);assert.match(await text('#div-table'),/a definir/);assert.match(await text('#div-table'),/estimada/);
   const rows=await page.eval(`[...document.querySelectorAll('#div-table tbody tr td:nth-child(3)')].map(t=>t.textContent)`);
   assert.deepEqual(rows,['10/10/2026','05/10/2026','01/09/2026']);
  }
  assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true);
  await page.shot(path.join(out,'dividends-'+size+'.png'),false);
  // Home hooks
  await page.go(base+'/?wallet='+wallet);
  await wait(`Boolean(window.Chart?.getChart('personal-equity-chart'))`);
  const kpi=await text('#personal-metrics'),routine=await text('#routine-dividends');
  if(mock){
   assert.match(kpi,/inclui R\$\s12,50 de proventos recebidos/);assert.match(kpi,/A receber: R\$\s30,00 \(proventos\)/);
   assert.match(routine,/Proventos: 1 a receber \(R\$\s30,00\), próximo pagamento 30\/10/);
   assert.match(await text('#personal-equity-table'),/Proventos \(recebidos \+ a receber\)/);
   assert.equal(await page.eval(`document.querySelector('#routine-dividends a').getAttribute('href')`),'/dividends?wallet='+encodeURIComponent(wallet));
  }else if(!hasReal)assert.doesNotMatch(kpi,/proventos recebidos/);
  assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true);
 }
 await page.go(base+'/comparison?wallet='+wallet);
 await wait(`!/Conferindo/.test(document.querySelector('#cmp-note').textContent)`);
 const cmp=await text('#cmp-note');console.log('comparison |',cmp);
 assert.match(cmp,mock||hasReal?/As carteiras incluem proventos/:/ainda não contabilizam proventos/);
 assert.deepEqual(blocked,[]);assert.deepEqual(page.console,[]);
 console.log('PASS dividends',mock?'(MOCKED populated, test-only)':hasReal?'(real payload)':'(real payload without dividends: unavailable state)');
});
