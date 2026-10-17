'use strict';
// DP-23: presentation/context only. Financial writes remain in the existing APIs.
(() => {
  const el=id=>document.getElementById(id), picker=el('product-wallet');
  if(!picker)return;
  const params=new URLSearchParams(location.search), route=location.pathname;
  const historical=params.get('demo')==='1'||(route==='/'&&location.hash==='#audit')||/^\/(legacy(?:\/|$)|paper(?:\.html|\/|$)|h2(?:\.html|\/|$)|index\.html$|portfolio(?:\.html|\/|$)|laboratory$|logs(?:\.html|\/|$))/.test(route);
  const esc=v=>String(v??'Indisponível').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'Indisponível':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const view={'/operations':'operations','/comparison':'comparison','/dividends':'dividends','/wallets/new':'create','/laboratory':'laboratory'}[route]||'wallet';
  const titles={wallet:'Visão da carteira',operations:'Operações',comparison:'Comparar carteiras',dividends:'Proventos',create:'Criar carteira'},subtitles={comparison:'Compare a trajetória das carteiras do mesmo grupo e o Ibovespa desde o início comum.'};
  let selected=params.get('wallet')||'';
  function carry(id){
    document.querySelectorAll('.hfl-primary a,.hfl-archive a,.product-wallet-link').forEach(a=>{
      const u=new URL(a.getAttribute('href'),location.origin);
      // Legacy and laboratory ledgers have their own wallet identities.
      if(['/','/operations','/comparison','/dividends','/wallets/new','/radar','/data','/market'].includes(u.pathname)){
        if(id)u.searchParams.set('wallet',id);else u.searchParams.delete('wallet');
        a.href=u.pathname+u.search+u.hash;
      }
    });
  }
  // DP-28 (A): cumulative return in %, read-only. Same revision + AbortController guard as personal-charts.js.
  const dm=v=>v?v.split('-').reverse().join('/'):'';
  const sp=(v,d=2)=>v==null?'Indisponível':(v>0?'+':'')+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const palette=['#3358d4','#0f8a68','#8757b4','#b07215','#ca5279']; // same order as personal-charts.js; color follows catalog order
  let cmpRev=0,cmpCtl,cmpChart;
  const getJson=async(url,signal)=>{const r=await fetch(url,{cache:'no-store',signal});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;};
  async function compare(wallets,sel){
    const v=++cmpRev;cmpCtl?.abort();cmpCtl=new AbortController();const signal=cmpCtl.signal;
    const note=el('cmp-note'),box=el('product-comparison');cmpChart?.destroy();cmpChart=null;el('cmp-wrap').hidden=true;
    if(!wallets.length){note.textContent='';box.innerHTML='<p>Nenhuma carteira cadastrada.</p>';return;}
    const me=wallets.find(w=>w.id===sel),group=me?.comparison_group||wallets.find(w=>w.comparison_group)?.comparison_group||null;
    const inGroup=wallets.filter(w=>group&&w.comparison_group===group),ref=(inGroup.includes(me)?me:inGroup[0])?.start_date;
    const used=inGroup.filter(w=>w.start_date===ref),skipped=inGroup.filter(w=>w.start_date!==ref);
    note.textContent='Conferindo históricos e fechamentos…';box.textContent='';
    try{
      const hist=Object.fromEntries(await Promise.all(wallets.map(async w=>{try{const h=await getJson('/api/portfolio/history?'+new URLSearchParams({wallet:w.id}),signal);return [w.id,h.wallet===w.id&&h.read_only===true?h:null];}catch(e){if(e.name==='AbortError')throw e;return [w.id,null];}})));
      // ponytail: benchmark is best-effort; any failure only switches the note to "indisponível".
      let bench=null;if(ref)try{const b=await getJson('/api/platform/market-base/benchmark?'+new URLSearchParams({since:ref}),signal);if(b.anchor&&b.rows?.length)bench=b;}catch(e){if(e.name==='AbortError')throw e;}
      if(v!==cmpRev)return;
      const ok=used.filter(w=>hist[w.id]),anchored=ok.some(w=>hist[w.id].initial_anchor_available);
      const sessions=[...new Set(ok.flatMap(w=>hist[w.id].daily_history.map(p=>p.session)))].sort();
      const labels=[...(anchored?['Início · '+dm(ref)]:[]),...sessions.map(dm)];
      const wl=ok.map(w=>{const h=hist[w.id],cap=Number(h.initial_capital),m=Object.fromEntries(h.daily_history.map(p=>[p.session,p]));
        return {w,data:[...(anchored?[h.initial_anchor_available?0:null]:[]),...sessions.map(s=>m[s]?.state==='AVAILABLE'&&m[s].equity!=null?(Number(m[s].equity)/cap-1)*100:null)]};});
      const bm=bench&&Object.fromEntries(bench.rows.map(r=>[r.date,Number(r.close)])),a0=bench&&bm[bench.anchor];
      const ib=a0?[...(anchored?[0]:[]),...sessions.map(s=>bm[s]==null?null:(bm[s]/a0-1)*100)]:null;
      let t=(!group?'Não há grupo comparativo cadastrado. ':!me?.comparison_group?'A carteira selecionada é pessoal e fica fora do grupo comparado (DP-19). ':'')+'Retorno acumulado sobre o capital inicial, por fechamentos B3 marcados ('+sessions.length+' pregões). ';
      t+=ib?'Ibovespa (Yahoo ^BVSP) é referência externa ancorada no fechamento de '+dm(bench.anchor).slice(0,5)+' e inclui proventos reinvestidos; as carteiras ainda não contabilizam proventos (APP-04). ':'Ibovespa indisponível no momento. As carteiras ainda não contabilizam proventos (APP-04). ';
      t+='Diferença observada é descritiva, não indica superioridade.';
      if(skipped.length)t+=' Fora do gráfico por início diferente de '+dm(ref)+': '+skipped.map(w=>w.name).join(', ')+'.';
      note.textContent=t;
      const color=w=>palette[wallets.indexOf(w)%palette.length];
      const sets=[...wl.map(x=>({label:x.w.name,data:x.data,borderColor:color(x.w),backgroundColor:color(x.w),borderWidth:2.5,pointRadius:4,spanGaps:false,tension:0})),...(ib?[{label:'Ibovespa (referência)',data:ib,borderColor:'#58647b',backgroundColor:'transparent',pointBackgroundColor:'#58647b',borderWidth:2,borderDash:[6,4],pointRadius:3,pointStyle:'rect',spanGaps:false,tension:0}]:[])];
      const any=sets.some(s=>s.data.some(x=>x!=null));
      el('cmp-wrap').hidden=!any;
      if(any){
        cmpChart=new Chart(el('cmp-chart'),{type:'line',data:{labels,datasets:sets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#43516a',boxWidth:12}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.raw==null?'Indisponível':sp(c.raw)+'%')}}},scales:{x:{grid:{display:false},ticks:{color:'#657188',maxTicksLimit:7,maxRotation:0}},y:{grid:{color:'#e2e7f0'},ticks:{color:'#657188',callback:x=>sp(x,1)+'%'}}}}});
        el('cmp-table').innerHTML='<div class="ds-table-wrap" tabindex="0" role="region" aria-label="Retorno acumulado por sessão"><table class="ds-table"><thead><tr><th scope="col">Data</th>'+sets.map(s=>'<th scope="col">'+esc(s.label)+'</th>').join('')+'</tr></thead><tbody>'+labels.map((l,i)=>'<tr><td>'+esc(l)+'</td>'+sets.map(s=>'<td>'+(s.data[i]==null?'Indisponível':sp(s.data[i])+'%')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
      }
      // Wallet table: every figure comes from the stored history; "Indisponível" only when data is truly missing.
      const per=(h,k)=>h?.periods.find(p=>p.key===k),good=p=>p?.state==='AVAILABLE';
      const last=h=>h?.daily_history.filter(p=>p.state==='AVAILABLE').at(-1);
      const bh=w=>wallets.find(o=>o.strategy==='BUY_HOLD'&&o.comparison_group&&o.comparison_group===w.comparison_group);
      const ret=p=>good(p)?sp(p.return_fraction*100)+'%<small>'+dm(p.anchor_session).slice(0,5)+' → '+dm(p.end_session).slice(0,5)+'</small>':'histórico insuficiente';
      const diff=w=>{if(!w.comparison_group)return 'fora do grupo';const b=bh(w);if(!b)return '—';if(b===w)return 'referência';const x=per(hist[w.id],'inception'),y=per(hist[b.id],'inception');
        return good(x)&&good(y)&&x.anchor_session===y.anchor_session&&x.end_session===y.end_session?sp((x.return_fraction-y.return_fraction)*100)+' p.p.':'—';};
      const rows=wallets.map(w=>{const h=hist[w.id],l=last(h);return '<tr><td><a href="/?wallet='+encodeURIComponent(w.id)+'">'+esc(w.name)+'</a></td><td>'+esc(w.nature_label)+'<small>'+esc(w.comparison_group||'Pessoal; sem grupo comparativo')+'</small></td><td>'+(l?money(l.equity)+'<small>fechamento '+dm(l.session).slice(0,5)+'</small>':money(w.equity))+'</td><td>'+(h?ret(per(h,'inception')):'Indisponível')+'</td><td>'+(h?ret(per(h,'1d')):'Indisponível')+'</td><td>'+diff(w)+'</td><td>'+money(w.cash)+'</td><td>'+(w.trades?.length??0)+'</td><td>'+money(w.costs)+'</td></tr>';});
      if(ib){const n=bench.rows.at(-1),p=bench.rows.at(-2);rows.push('<tr><td>Ibovespa (referência)<small>Yahoo ^BVSP · inclui proventos</small></td><td>Índice externo</td><td>—</td><td>'+(n.date>bench.anchor?sp((Number(n.close)/a0-1)*100)+'%<small>'+dm(bench.anchor).slice(0,5)+' → '+dm(n.date).slice(0,5)+'</small>':'histórico insuficiente')+'</td><td>'+(p&&n.date>p.date?sp((Number(n.close)/Number(p.close)-1)*100)+'%<small>'+dm(p.date).slice(0,5)+' → '+dm(n.date).slice(0,5)+'</small>':'histórico insuficiente')+'</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>');}
      box.innerHTML='<div class="ds-table-wrap product-compare-table" tabindex="0" role="region" aria-label="Carteiras comparadas"><table class="ds-table"><thead><tr>'+['Carteira','Natureza / grupo','Patrimônio marcado','Retorno desde o início','Dia','Diferença vs Buy & Hold','Caixa','Operações','Custos'].map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
    }catch(e){if(e.name!=='AbortError'&&v===cmpRev){note.textContent='Comparação indisponível. Nenhum valor foi estimado.';box.textContent='';}}
  }
  function walletsLoaded(wallets,id){
    selected=id||selected||wallets[0]?.id||'';
    if(!wallets.some(w=>w.id===selected))selected=wallets[0]?.id||'';
    picker.innerHTML=wallets.length?wallets.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join(''):'<option value="">Nenhuma carteira</option>';
    picker.value=selected;picker.disabled=!wallets.length;
    el('product-nature').textContent=wallets.find(w=>w.id===selected)?.nature_label||'';
    carry(selected);
    if(el('product-comparison')){
      compare(wallets,selected);
    }
  }
  picker.addEventListener('change',()=>{
    const u=new URL(location.href);u.searchParams.set('wallet',picker.value);
    // Navigation intentionally clears any unconfirmed operation/paid consent.
    location.assign(u.pathname+u.search+u.hash);
  });
  window.addEventListener('hfl:wallets',e=>walletsLoaded(e.detail.wallets,e.detail.selected));
  if(window.HFLPersonalCatalog)walletsLoaded(window.HFLPersonalCatalog.wallets,window.HFLPersonalCatalog.selected);
  window.addEventListener('popstate',()=>carry(picker.value));
  if(historical){
    picker.innerHTML='<option>Contexto independente</option>';picker.disabled=true;
    el('product-nature').textContent=params.get('demo')==='1'?'Demonstração sintética':'Acervo / laboratório';
  }
  if(el('personal-portfolios')){
    document.body.dataset.productView=view;
    if(titles[view]){el('personal-title').textContent=titles[view];document.title=titles[view]+' · Hedge Fund Lab';}
    if(subtitles[view])el('personal-subtitle').textContent=subtitles[view];
    const laboratory=el('home-laboratory');
    laboratory.hidden=view!=='laboratory'&&location.hash!=='#audit';
    if(view==='laboratory'||location.hash==='#audit'){laboratory.open=true;el('personal-portfolios').hidden=true;}
    document.querySelectorAll('[data-personal-view]').forEach(n=>{n.hidden=n.dataset.personalView!==view;});
    if(view==='create')el('personal-create').hidden=false;
    if(params.get('demo')!=='1'&&view!=='laboratory')el('home-portfolio').hidden=true;
    el('product-buy')?.addEventListener('click',()=>setSide('BUY'));
    el('product-sell')?.addEventListener('click',()=>setSide('SELL'));
    function setSide(side){const input=el('trade-form').elements.namedItem('side');input.value=side;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===side)));}
    el('trade-form').elements.namedItem('side').addEventListener('change',e=>document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===e.target.value))));
  }else if(!historical){
    fetch('/api/portfolio/manual',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>walletsLoaded(d.wallets)).catch(()=>{picker.innerHTML='<option value="">Carteiras indisponíveis</option>';picker.disabled=true;});
  }
  if(el('new-analysis')){
    let currentStage;
    function stage(){
      const name={'#new-analysis':'setup','#analysis-workflow':'workflow','#analysis-results':'results'}[location.hash]||(params.get('run')?'results':'setup');
      document.body.dataset.agentStage=name;
      document.querySelectorAll('[data-agent-screen]').forEach(n=>{n.hidden=n.dataset.agentScreen!==name;});
      document.querySelectorAll('[data-agent-stage]').forEach(n=>{if(n.dataset.agentStage===name)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');});
      if(currentStage&&currentStage!==name)window.dispatchEvent(new CustomEvent('hfl:analysis-stage',{detail:name}));
      currentStage=name;
    }
    window.addEventListener('hashchange',stage);stage();
  }
  if(!el('product-data-body'))return;
  async function loadData(){
    el('product-data-status').textContent='Conferindo a execução e os dados registrados…';
    el('product-data-error').hidden=true;
    try{
      const r=await fetch('/api/platform/radar-runs',{cache:'no-store'}),registry=await r.json();if(!r.ok)throw Error(registry.error);
      const run=registry.runs.find(x=>x.id===registry.runner);
      if(!run)throw Error('Nenhuma execução operacional disponível. Crie uma análise na área Agentes.');
      const q=new URLSearchParams({run:run.id,session:run.session,tickers:run.universe.join(',')});
      const response=await fetch('/api/platform/radar-readiness?'+q,{cache:'no-store'}),d=await response.json();if(!response.ok)throw Error(d.error);
      el('product-data-status').textContent=`Dados dos agentes até ${d.session.split('-').reverse().join('/')} · ${d.inputs_ready}/${d.items.length} ativos preparados.`;
      el('product-data-run').textContent=run.id;
      el('product-data-body').innerHTML=d.items.map(i=>`<tr><td><strong>${esc(i.ticker)}</strong></td><td><span class="product-health ${i.input_state==='FROZEN'?'':i.input_state==='PREPARING'?'neutral':'warn'}">${esc({FROZEN:'Preparado',PREPARING:'Preparando',BLOCKED_DATA:'Dados incompletos',PREPARATION_REQUIRED:'Ainda não preparado',INTEGRITY_ERROR:'Revisão necessária',UNRESOLVED_DIVERGENCE:'Divergência'}[i.input_state]||i.input_state)}</span></td><td>${esc(i.input?.mode==='synthetic'?'Sintética':i.input?'B3 + ajuste Yahoo':'B3 + ajuste Yahoo · preparo pendente')}</td><td>${esc(i.action)}${i.error?`<small>${esc(i.error)}</small>`:''}</td></tr>`).join('');
    }catch(e){el('product-data-error').textContent=e.message||'Não foi possível consultar os dados.';el('product-data-error').hidden=false;el('product-data-status').textContent='Consulta indisponível. Nenhuma coleta foi iniciada.';}
  }
  el('product-data-refresh').addEventListener('click',loadData);
  el('product-data-prepare').addEventListener('click',()=>el('hfl-market-open').click());
  loadData();
})();
