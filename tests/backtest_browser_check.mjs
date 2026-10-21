// Real Chrome against a local dashboard: Laboratório backtest panel. GET-only; other mutations are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {session, VIEWPORTS} from '../scripts/ui_cdp_v762.mjs';
const [base,out]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
await session(async page=>{
  const blocked=[];
  page.listeners.push(msg=>{
    if(msg.method!=='Fetch.requestPaused')return;
    const {request,requestId}=msg.params,u=new URL(request.url);
    // DP-26: the home's own intraday collection is out of scope here; refuse it without reaching Yahoo.
    if(u.pathname==='/api/portfolio/stock-history/intraday/refresh'){page.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return;}
    const safe=request.method==='GET'&&u.origin===base;
    if(!safe)blocked.push(request);
    page.send(safe?'Fetch.continueRequest':'Fetch.failRequest',safe?{requestId}:{requestId,errorReason:'BlockedByClient'});
  });
  await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  const wait=async expr=>{for(let n=0;n<80;n++){if(await page.eval(expr))return;await new Promise(r=>setTimeout(r,150));}assert.fail(expr);};
  for(const size of ['desktop','phone']){
    await page.viewport(VIEWPORTS[size]);
    await page.go(base+'/laboratory');
    await wait(`!!document.querySelector('#lab-bt-form').end.value`);
    // 400 shown inline: weights that do not sum to 100%
    await page.eval(`(()=>{const f=document.querySelector('#lab-bt-form');f.mode.value='custom';f.mode.dispatchEvent(new Event('change'));f.querySelector('.lab-bt-w').value=30;})()`);
    await page.click('#lab-bt-form button[type=submit]');
    assert.match(await page.eval(`document.querySelector('#lab-bt-error').textContent`),/somar 100/);
    // server-side 400: start before the first date of a ticker
    await page.eval(`(()=>{const f=document.querySelector('#lab-bt-form');f.mode.value='equal';f.mode.dispatchEvent(new Event('change'));f.start.value='1990-01-02';})()`);
    await page.click('#lab-bt-form button[type=submit]');
    await wait(`!document.querySelector('#lab-bt-error').hidden&&/desde/.test(document.querySelector('#lab-bt-error').textContent)`);
    // valid run
    await page.eval(`(()=>{const f=document.querySelector('#lab-bt-form');f.start.value='2020-01-02';f.rebalance.value='quarterly';})()`);
    await page.click('#lab-bt-form button[type=submit]');
    await wait(`!document.querySelector('#lab-bt-result').hidden&&document.querySelectorAll('#lab-bt-metrics tbody tr').length>=8`);
    assert.equal(await page.eval(`document.querySelector('#lab-bt-error').hidden`),true);
    assert.match(await page.eval(`document.querySelector('#lab-bt-notes').textContent`),/não previsão/);
    assert.equal(await page.eval(`Chart.getChart('lab-bt-chart').data.datasets.length>=1`),true);
    assert.equal(await page.eval(`document.querySelectorAll('#lab-bt-table tbody tr').length>100`),true);
    assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true,size);
    await page.shot(path.join(out,'backtest-'+size+'.png'),false);
  }
  assert.deepEqual(blocked.map(r=>r.method+' '+r.url),[]);assert.deepEqual(page.console,[]);
  console.log('PASS: backtest panel inline 400s, run, chart, metrics, table; desktop/phone without horizontal scroll; GET-only');
});
