// Actual shared shell action: no DOM framework and no real HTTP/provider request.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function app(){
  const fields={},pending=[],timers=[];
  const el=id=>fields[id]??={disabled:false,hidden:true,textContent:'',href:'',open:false,listeners:{},children:[],
    addEventListener(k,f){this.listeners[k]=f},setAttribute(){},showModal(){this.open=true},close(){this.open=false},
    replaceChildren(...c){this.children=c}};
  const context=vm.createContext({document:{querySelector:()=>null,getElementById:el,createElement:()=>({textContent:''})},window:{addEventListener(){}},
    location:{reload(){}},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},
    fetch:(url,options={})=>new Promise(resolve=>pending.push({url,options,reply:(d,ok=true)=>resolve({ok,json:async()=>d})}))});
  vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),context);
  const take=()=>{assert.ok(pending.length);return pending.shift()};
  return {el,pending,timers,take};
}
const tick=()=>new Promise(r=>setImmediate(r));
const cov=(last)=>({PETR4:{first:'2000-01-03',last,rows:1,conflicts:0,gaps:0},VALE3:null});
const base={running:false,started_at:null,finished_at:null,closed:'2026-10-16',last:null,error:null,csrf_token:'token'};
async function open(a,d){
  a.el('hfl-market-open').listeners.click();
  const get=a.take();assert.equal(get.url,'/api/platform/market-base');get.reply(d);await tick();
}
(async()=>{
  const a=app();assert.equal(a.pending.length,0,'page load must never fetch');
  await open(a,{...base,coverage:{PETR4:null,VALE3:null}});
  assert.match(a.el('hfl-market-scope').textContent,/sem dados ainda.*16\/10\/2026/);
  assert.equal(a.el('hfl-market-start').disabled,false);
  const b=app();await open(b,{...base,coverage:{PETR4:{first:'2000-01-03',last:'2026-10-14'},VALE3:{first:'2001-02-01',last:'2026-10-15'}}});
  assert.match(b.el('hfl-market-scope').textContent,/até 14\/10\/2026.*fechado: 16\/10\/2026/);
  assert.equal(b.el('hfl-market-start').disabled,false);
  assert.equal(b.pending.length,0,'opening panel is read-only');
  b.el('hfl-market-start').listeners.click();b.el('hfl-market-start').listeners.click();
  assert.equal(b.pending.length,1,'double click must start only one job');
  const post=b.take();assert.equal(post.url,'/api/platform/market-base/update');assert.equal(post.options.method,'POST');
  assert.equal(post.options.headers['X-CSRF-Token'],'token');
  post.reply({...base,running:true,coverage:{PETR4:{first:'a',last:'2026-10-14'}}});await tick();
  assert.equal(b.el('hfl-market-start').disabled,true);
  b.timers.shift()();
  const cv={PETR4:{first:'2000-01-03',last:'2026-10-15'},VALE3:{first:'2001-02-01',last:'2026-10-15'}};
  b.take().reply({...base,running:false,coverage:cv,last:{closed:'2026-10-16',results:[{file:'COTAHIST_D15102026.ZIP',status:'ACQUIRED'},{file:'COTAHIST_D16102026.ZIP',status:'NOT_PUBLISHED'},{file:'COTAHIST_A2026.ZIP',status:'FAILED',error:'timeout'}],yahoo:{PETR4:'OK',VALE3:'HTTP 429'}}});await tick();
  const t=b.el('hfl-market-status').textContent;
  assert.match(t,/1 arquivo novo da B3/);assert.match(t,/ainda não publicou: 16\/10/);assert.match(t,/arquivo anual 2026 \(timeout\)/);assert.match(t,/VALE3 \(HTTP 429\)/);
  assert.equal(b.el('hfl-market-reload').hidden,false);
  const c=app();await open(c,{...base,coverage:{PETR4:{first:'a',last:'2026-10-16'}}});
  assert.match(c.el('hfl-market-status').textContent,/Base em dia/);assert.equal(c.el('hfl-market-start').disabled,true);
  const r=app();await open(r,{...base,running:true,coverage:{PETR4:null}});
  assert.equal(r.pending.length,0);assert.equal(r.el('hfl-market-start').disabled,true);assert.equal(r.timers.length,1);
  const f=app();await open(f,{...base,coverage:{PETR4:null}});f.el('hfl-market-start').listeners.click();
  f.take().reply({error:'invalid_csrf'},false);await tick();
  assert.match(f.el('hfl-market-status').textContent,/invalid_csrf/);assert.equal(f.timers.length,0);
  console.log('PASS: market-base dialog: coverage, behind/em dia, POST+CSRF, double click, polling, summary, resume, failure');
})().catch(e=>{console.error(e);process.exitCode=1});
