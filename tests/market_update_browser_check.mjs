// Real Chrome against a local dashboard; only the market-base update POST is fulfilled by a fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {session, VIEWPORTS} from '../scripts/ui_cdp_v762.mjs';
const [base,out]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
await session(async page=>{
  let mock=false,posts=0;
  const blocked=[];
  const fake={running:false,started_at:null,finished_at:null,closed:'2026-10-16',error:null,csrf_token:'fixture',coverage:{PETR4:{first:'2000-01-03',last:'2026-10-14',rows:1,conflicts:0,gaps:0},VALE3:null},
    last:{closed:'2026-10-16',results:[{file:'COTAHIST_D16102026.ZIP',status:'NOT_PUBLISHED',error:null}],yahoo:{PETR4:'OK'}}};
  page.listeners.push(msg=>{
    if(msg.method!=='Fetch.requestPaused')return;
    const {request,requestId}=msg.params,u=new URL(request.url);
    let value;
    // Only the update POST is faked: no real update or provider traffic.
    if(mock&&u.pathname==='/api/platform/market-base/update'){
      assert.equal(request.method,'POST');assert.deepEqual(JSON.parse(request.postData),{});
      posts++;value={...fake,running:true};
    }
    if(value){page.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(value)).toString('base64')});return;}
    // DP-26: the home's own intraday collection is out of scope here; refuse it without reaching Yahoo.
    if(u.pathname==='/api/portfolio/stock-history/intraday/refresh'){page.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return;}
    const safe=request.method==='GET'&&u.origin===base;
    if(!safe)blocked.push(request);
    page.send(safe?'Fetch.continueRequest':'Fetch.failRequest',safe?{requestId}:{requestId,errorReason:'BlockedByClient'});
  });
  await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const size of ['desktop','phone']){
    await page.viewport(VIEWPORTS[size]);
    mock=false;
    await page.go(base+'/');
    assert.equal(await page.eval(`document.querySelector('#hfl-market-dialog').open`),false);
    mock=true;
    await page.eval(`document.querySelector('#hfl-market-open').focus()`);await page.key('Enter');
    for(let n=0;n<30;n++){if(await page.eval(`/Base local/.test(document.querySelector('#hfl-market-scope').textContent)`))break;await new Promise(r=>setTimeout(r,100));}
    assert.match(await page.eval(`document.querySelector('#hfl-market-scope').textContent`),/Base local/);
    assert.match(await page.eval(`document.querySelector('#hfl-market-coverage').textContent`),/PETR4/);
    assert.equal(await page.eval(`document.querySelectorAll('#hfl-market-coverage li').length>0`),true);
    if(await page.eval(`!document.querySelector('#hfl-market-start').disabled`)){
      const before=posts;await page.click('#hfl-market-start');
      for(let n=0;n<30&&posts===before;n++)await new Promise(r=>setTimeout(r,100));
      assert.equal(posts,before+1);
    }
    assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    await page.shot(path.join(out,'market-update-'+size+'.png'),false);
    await page.key('Escape');
    assert.equal(await page.eval(`document.querySelector('#hfl-market-dialog').open`),false);
    assert.equal(await page.eval(`document.activeElement.id`),'hfl-market-open');
  }
  mock=false;
  for(const route of ['/market','/radar','/portfolio','/legacy','/legacy/paper']){
    await page.go(base+route);
    assert.equal(await page.eval(`document.querySelectorAll('#hfl-market-open').length`),1,route);
    assert.equal(await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`),true,route);
  }
  assert.ok(posts<=2);assert.deepEqual(blocked.map(r=>r.method+" "+r.url),[]);assert.deepEqual(page.console,[]);
  console.log('PASS: global button across modules; fixture-only update POST; desktop/phone modal, keyboard, focus, no live POST or external traffic');
});
