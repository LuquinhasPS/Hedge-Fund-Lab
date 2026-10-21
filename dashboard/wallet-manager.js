'use strict';
(() => {
  const el=id=>document.getElementById(id), panel=el('wallet-manager');
  if(!panel)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const day=v=>v.split('-').reverse().join('/');
  const pct=v=>(Number(v)*100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
  const states={PREPARED:'Preparada',RUNNING:'Gerando',CLAIMED_RECOVERY_ONLY:'Autorizada Â· consultar/recuperar',RECOVERY_OR_REVIEW_REQUIRED:'RevisÃ£o necessÃ¡ria',VALID_PROPOSAL:'Proposta gerada',APPLIED:'MovimentaÃ§Ãµes registradas',PENDING_AUCTION:'Aprovada, aguardando leilÃ£o',EXECUTED:'Executada no leilÃ£o',NOT_EXECUTED:'Aprovada Â· nenhuma ordem executÃ¡vel',ORDER_REJECTED:'Ordem recusada na execuÃ§Ã£o',EXPIRED:'Proposta expirada'};
  const auction=a=>'leilÃ£o de '+(a.leg==='OPEN'?'abertura':'fechamento')+' de '+day(a.session);
  const stateText=s=>s.status==='PENDING_AUCTION'?'Aprovada, aguardando o '+auction(s.order)+'. Executa ao preÃ§o oficial B3.':s.status==='EXECUTED'?'Executada no '+auction(s.execution):states[s.status];
  const errors={manager_wallet_changed_new_analysis_required:'A carteira mudou (provento lanÃ§ado ou nova operaÃ§Ã£o). Abra uma nova anÃ¡lise.',manager_complete_unique_universe_required:'O gestor devolveu uma cesta incompleta ou repetida. A resposta foi preservada para revisÃ£o.',manager_universe_must_cover_all_positions:'Inclua todas as posiÃ§Ãµes da carteira nos ativos do quÃ³rum.',manager_budget_exceeded:'O teto informado ou o orÃ§amento acumulado do Gestor Global nÃ£o cobre esta chamada.',manager_key_or_network_isolation_missing:'Chave ou isolamento do servidor indisponÃ­vel. Reinicie o servidor padrÃ£o.',manager_contract_changed:'O contrato mudou. Esta proposta continua no histÃ³rico; prepare outra para operar.',manager_insufficient_cash:'A proposta ultrapassou o caixa disponÃ­vel, incluindo custos. Foi preservada para revisÃ£o.',manager_operation_incompatible_with_opinion:'A proposta contrariou um parecer ou veto. NÃ£o foi liberada para registro.',manager_insufficient_units:'A proposta tentou vender mais aÃ§Ãµes do que a carteira possui.',manager_financial_consent_required:'Revise a prÃ©via e confirme a aprovaÃ§Ã£o das movimentaÃ§Ãµes.',manager_context_expired:'O contexto do gestor expirou. Prepare outra proposta.',manager_proposal_expired:'Proposta expirada: os leilÃµes do pregÃ£o-alvo jÃ¡ passaram. Nada foi registrado; prepare outra anÃ¡lise.',manager_pending_order_exists:'Esta carteira jÃ¡ tem uma ordem aprovada aguardando leilÃ£o. Aguarde a execuÃ§Ã£o.',manager_order_already_placed:'Esta proposta jÃ¡ foi aprovada.',manager_no_envelope_to_replay_or_busy:'NÃ£o hÃ¡ resposta recuperÃ¡vel ou a chamada ainda estÃ¡ em andamento.'};
  // Free steps run by themselves once per view (prepare when there is no proposal, preview
  // when one is approvable); every paid call and the approval keep their own consent.
  let autoPrepared='', autoPreviewed='';
  const COST='hfl-manager-cost'; // last cost rate typed, a per-browser convenience
  try{const v=localStorage.getItem(COST);if(v!==null)el('manager-cost').value=v;}catch{}
  let needsAck=false, data, selected=new URLSearchParams(location.search).get('proposal')||'', report, preview, version=0, busy=false, poll, command=crypto.randomUUID().replaceAll('-','');
  const run=()=>el('radar-run').value||new URLSearchParams(location.search).get('run');
  const current=()=>data?.history.find(s=>s.context.proposal===selected);
  // What this panel already shows, for the cycle view in radar-analysis.js; no extra request.
  const cycle=()=>window.dispatchEvent(new CustomEvent('hfl:cycle',{detail:{manager:data&&(data.context?{s:current(),failure:current()?.failure&&message({message:current().failure.code}),consult:data.context.wallet.nature!=='SIMULATION'||data.context.wallet.strategy==='BUY_HOLD'||current()?.compatible===false,preview:Boolean(preview),inference:!el('manager-inference').hidden,cost:el('manager-cost').value!==''}:null)}}));
  function message(e){const code=e.message||String(e);return code.startsWith('manager_incomplete_quorum_')?'O gestor aguarda pareceres completos: '+code.slice('manager_incomplete_quorum_'.length).split('_').join(', ').toUpperCase()+'. Consulte os resultados por ativo e a recuperaÃ§Ã£o do quÃ³rum.':errors[code]||code;}
  const spct=v=>(v>0?'+':'')+pct(v), clock=v=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const flags={SESSION_CLOSED:'pregÃ£o fechado: Ãºltimo fechamento oficial',SESSION_PRE:'pregÃ£o ainda nÃ£o abriu: Ãºltimo fechamento oficial',INTRADAY_UNAVAILABLE:'cotaÃ§Ã£o atrasada indisponÃ­vel: Ãºltimo fechamento oficial'};
  function quoteCell(q){
    if(!q.value)return 'Sem cotaÃ§Ã£o nem fechamento oficial';
    if(q.basis==='DELAYED_QUOTE')return money(q.value)+(q.flag?' Â· pregÃ£o encerrado: Ãºltimo negÃ³cio atrasado de '+day(q.quote_session)+', '+clock(q.quote_time)+'; fechamento oficial ainda nÃ£o publicado':' Â· atraso ~'+q.declared_delay_min+' min, coletada Ã s '+clock(q.fetched_at));
    return money(q.value)+' Â· '+(flags[q.flag]||'Ãºltimo fechamento oficial')+' de '+day(q.quote_session);
  }
  function quotesTable(rows,schedule){
    const body=Object.entries(rows).map(([t,r])=>{
      const st=r.stale, move=st.evaluated?st.move:(r.quote.value?Number(r.quote.value)/Number(r.decision)-1:null), tol=r.tolerance_by_minutes;
      return `<tr><td><strong>${esc(t)}</strong></td><td>${money(r.decision)}</td><td>${esc(quoteCell(r.quote))}</td><td>${move===null?'â€”':esc(spct(move))+(st.dividends?.length?' (ajustado por proventos)':'')+(st.alert?' Â· ALERTA: tese possivelmente desatualizada (faixa '+esc(pct(st.band))+')':'')}</td><td>${r.volatility?'atÃ© 15 min: '+pct(tol[15])+' Â· 30 min: '+pct(tol[30])+' Â· 60 min: '+pct(tol[60]):'sem histÃ³rico de volatilidade: faixa mÃ¡xima de '+pct(0.02)}</td></tr>`;
    }).join('');
    return '<p>CotaÃ§Ã£o atrasada, sÃ³ informativa: nÃ£o Ã© preÃ§o de execuÃ§Ã£o. Alvo: '+esc(auction(schedule))+'.</p><div class="ds-table-wrap" tabindex="0" role="region" aria-label="CotaÃ§Ãµes da prÃ©via, tabela rolÃ¡vel"><table class="ds-table"><thead><tr><th>Ativo</th><th>PreÃ§o de decisÃ£o (fechamento do gestor)</th><th>CotaÃ§Ã£o atrasada</th><th>VariaÃ§Ã£o vs decisÃ£o</th><th>VariaÃ§Ã£o aceita atÃ© a aprovaÃ§Ã£o</th></tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  async function api(commandName, payload, runId=run()){
    const r=await fetch('/api/platform/wallet-manager'+(commandName?'/'+commandName:'?'+new URLSearchParams({run:runId})),payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':data.csrf_token},body:JSON.stringify(payload)}:{cache:'no-store'});
    const d=await r.json();if(!r.ok)throw Error(d.error||'NÃ£o foi possÃ­vel consultar a proposta.');return d;
  }
  function dismiss(){report=null;preview=null;el('manager-paid').checked=false;el('manager-financial').checked=false;el('manager-run').disabled=true;el('manager-apply').disabled=true;el('manager-inference').hidden=true;el('manager-preview-box').hidden=true;el('manager-stale').hidden=true;el('manager-stale-ack').checked=false;el('manager-quotes').innerHTML='';needsAck=false;cycle();}
  function draw(){
    const s=current(), c=s?.context, r=s?.result;
    el('manager-history').innerHTML=data.history.length?data.history.map(s=>`<option value="${esc(s.context.proposal)}">${esc(new Date(s.context.created_at).toLocaleString('pt-BR'))} Â· ${esc(stateText(s))} Â· taxa original da proposta ${esc(s.context.cost_rate_pct)}%</option>`).join(''):'<option value="">Nenhuma proposta</option>';
    el('manager-history').value=selected;
    el('manager-result').hidden=!r;
    el('manager-attempts').hidden=!s?.failures?.length;
    el('manager-failures').innerHTML=(s?.failures||[]).map(f=>'<li>'+esc(new Date(f.recorded_at).toLocaleString('pt-BR'))+' Â· '+esc(message({message:f.code}))+'</li>').join('');
    el('manager-replay').hidden=!s||!['CLAIMED_RECOVERY_ONLY','RECOVERY_OR_REVIEW_REQUIRED'].includes(s.status)||!s.compatible;
    el('manager-status').textContent=s?stateText(s):'Informe os custos para preparar o contexto do gestor. Nenhuma chamada Ã© feita nesta consulta.';
    if(s?.failure&&!r)el('manager-status').textContent+=' Â· '+message({message:s.failure.code})+' Â· nenhum registro financeiro foi feito.';
    cycle();
    if(!r)return;
    el('manager-summary').textContent=r.response.summary;
    el('manager-price-note').textContent=`ReferÃªncia: fechamento RAW B3 de ${day(c.reference_session)}. NÃ£o Ã© cotaÃ§Ã£o ao vivo. Contexto congelado em ${new Date(c.created_at).toLocaleString('pt-BR')}; alvo da anÃ¡lise ${day(c.target_date)}. Taxa utilizada na proposta original: ${c.cost_rate_pct}% por operaÃ§Ã£o.`;
    const sides={BUY:'Comprar',SELL:'Vender',HOLD:'Manter'};
    el('manager-plan').innerHTML='<div class="ds-table-wrap" tabindex="0" role="region" aria-label="Plano de alocaÃ§Ã£o, tabela rolÃ¡vel"><table class="ds-table"><thead><tr><th>Ativo</th><th>Atual</th><th>MovimentaÃ§Ã£o</th><th>Depois</th><th>PreÃ§o de referÃªncia</th><th>Valor da operaÃ§Ã£o</th><th>Custos</th><th>Peso antes â†’ depois</th><th>Motivo</th></tr></thead><tbody>'+r.rows.map(a=>`<tr><td><strong>${esc(a.ticker)}</strong></td><td>${esc(a.quantity_before)}</td><td>${sides[a.side]}${a.side==='HOLD'?'':' '+esc(a.quantity)+' aÃ§Ãµes'}${a.side==='SELL'?' Â· '+(Number(a.quantity_after)===0?'saÃ­da total':'reduÃ§Ã£o parcial'):''}</td><td>${esc(a.quantity_after)}</td><td>${money(a.price)}</td><td>${money(a.gross)}</td><td>${money(a.costs)}</td><td>${pct(a.weight_before)} â†’ ${pct(a.weight_after)}</td><td>${esc(a.reasoning)}</td></tr>`).join('')+'</tbody></table></div>';
    el('manager-cash').textContent=`ProjeÃ§Ã£o original de caixa: ${money(r.cash_before)} â†’ ${money(r.cash_after)} Â· custos da proposta original: ${money(r.total_costs)}. Vendas financiam compras somente neste livro econÃ´mico simulado, sem liquidaÃ§Ã£o de corretora.`;
    el('manager-risks').innerHTML=r.response.risks.map(s=>'<li>'+esc(s)+'</li>').join('');
    const consultOnly=c.wallet.nature!=='SIMULATION'||c.wallet.strategy==='BUY_HOLD'||!s.compatible;
    el('manager-approval').hidden=Boolean(s.applied||s.order)||s.status==='EXPIRED'||consultOnly||!r.trades.length;
    const prices=Object.entries(s.execution?.prices||{}).map(([t,p])=>t+(p.auction?' decisÃ£o '+money(p.decision)+' â†’ leilÃ£o '+money(p.auction):' sem preÃ§o oficial')).join('; ');
    el('manager-receipt').textContent=s.execution?(s.status==='ORDER_REJECTED'?'Ordem recusada na execuÃ§Ã£o ('+s.execution.reason+'). Nada foi registrado.':(s.status==='EXECUTED'?'Executada no ':'Nenhuma ordem executÃ¡vel no ')+auction(s.execution)+' em '+new Date(s.execution.executed_at).toLocaleString('pt-BR')+(prices?'. PreÃ§os: '+prices:'')+(s.execution.adjustments.length?'. Compras reduzidas por falta de caixa: '+s.execution.adjustments.map(a=>a.ticker+' '+a.ordered+' â†’ '+a.executed).join(', '):'')+'. HistÃ³rico preservado; a aprovaÃ§Ã£o nÃ£o serÃ¡ repetida.'):s.order?'Ordem aprovada em '+new Date(s.order.approved_at).toLocaleString('pt-BR')+'. Caixa e posiÃ§Ãµes sÃ³ mudam quando o preÃ§o oficial do '+auction(s.order)+' entrar na base (Atualizar dados).':s.applied?'Cesta registrada em '+new Date(s.applied.recorded_at).toLocaleString('pt-BR')+'. HistÃ³rico preservado; a aprovaÃ§Ã£o nÃ£o serÃ¡ repetida.':s.status==='EXPIRED'?'Proposta expirada: os leilÃµes do pregÃ£o-alvo ('+day(c.target_date)+') jÃ¡ passaram. Nada foi registrado.':consultOnly?'Consulta apenas: '+(!s.compatible?'contrato histÃ³rico preservado.':c.wallet.nature!=='SIMULATION'?'carteira de operaÃ§Ãµes reais externas nÃ£o recebe operaÃ§Ãµes simuladas.':'a estratÃ©gia Buy & Hold nÃ£o aceita rebalanceamento automÃ¡tico.') :!r.trades.length?'O gestor propÃ´s manter a carteira; nÃ£o hÃ¡ operaÃ§Ãµes para registrar.':'';
    if(s.applied&&data.ledger){
      const originalIds=new Set(data.ledger.audit.filter(e=>e.source?.proposal===c.proposal).map(e=>e.id));
      const corrected=data.ledger.audit.some(e=>e.kind==='CORRECTION'&&originalIds.has(e.target));
      if(corrected){
        const booked=data.ledger.trades.filter(t=>t.source?.proposal===c.proposal);
        const rates=[...new Set(booked.map(t=>t.source.cost_rate_pct))];
        el('manager-receipt').textContent+=' HÃ¡ correÃ§Ãµes posteriores no histÃ³rico de OperaÃ§Ãµes.'+(booked.length===r.trades.length&&rates.length===1?' Taxa registrada: '+rates[0]+'% Â· custos registrados desta cesta: '+money(booked.reduce((sum,t)=>sum+Number(t.costs),0))+'.':'')+' A justificativa e a tabela abaixo preservam a proposta original, anterior Ã s correÃ§Ãµes.';
      }
    }
  }
  async function load(reset=false){
    const id=run();if(!id)return;
    const v=version;
    const d=await api('',undefined,id);if(v!==version)return;
    if(d.context&&d.history.some(s=>s.applied)){
      try{
        const response=await fetch('/api/portfolio/manual?'+new URLSearchParams({wallet:d.context.wallet.id}),{cache:'no-store'});
        if(response.ok)d.ledger=(await response.json()).selected;
      }catch{} // Historical proposal stays readable when the personal ledger is unavailable.
      if(v!==version)return;
    }
    data=d;panel.hidden=!d.context;if(!d.context)return cycle();
    if(reset||!d.history.some(s=>s.context.proposal===selected))selected=d.history.at(-1)?.context.proposal||'';
    el('manager-context').textContent=`${d.context.wallet.name} Â· alvo ${day(d.context.target_date)} Â· dados atÃ© ${day(d.context.reference_session)} Â· caixa preservado ${money(d.context.wallet.cash)}.`+(d.context.wallet.strategy==='BUY_HOLD'?' Buy & Hold: o plano serÃ¡ consultivo; para rebalancear, abra o quÃ³rum da Multiagentes.':d.context.wallet.nature!=='SIMULATION'?' Carteira real externa: consulta apenas, sem registrar negÃ³cios simulados.':'');
    draw();
    // product.js's stage rule, read here because it may run after this first load
    const s=current(), shown=location.hash==='#analysis-results'||(!['#new-analysis','#analysis-workflow'].includes(location.hash)&&new URLSearchParams(location.search).has('run'));
    // nothing yet -> prepare (needs a cost rate); prepared but not run -> its paid consent
    if(shown&&autoPrepared!==id&&(s?.status==='PREPARED'&&s.compatible||!d.history.length&&el('manager-cost').value!=='')){autoPrepared=id;setTimeout(()=>s?action(v=>offer(v,el('manager-budget').value)):el('manager-prepare-form').requestSubmit());}
    else if(shown&&s?.result&&!el('manager-approval').hidden&&!preview&&autoPreviewed!==selected){autoPreviewed=selected;setTimeout(()=>el('manager-preview').click());}
    clearTimeout(poll);
    if(['RUNNING','CLAIMED_RECOVERY_ONLY'].includes(current()?.status))poll=setTimeout(()=>load().catch(failure),2500);
  }
  function failure(e){el('manager-error').textContent=message(e);el('manager-error').hidden=false;}
  async function action(fn){
    if(busy)return;busy=true;panel.setAttribute('aria-busy','true');el('manager-error').hidden=true;
    const v=version;
    try{await fn(v);}catch(e){if(v===version)failure(e);}finally{busy=false;panel.removeAttribute('aria-busy');}
  }
  async function offer(v,cap){ // free preflight of the selected proposal -> its paid-call consent
    const p=await api('preflight',{run:run(),proposal:selected,max_usd:cap});if(v!==version)return;
    await load();if(v!==version)return;report=p;
    el('manager-estimate').textContent=`Uma chamada do gestor Â· estimativa US$ ${p.estimate.usd_estimated} Â· reserva mÃ¡xima US$ ${p.usd_reserved} Â· reservas do gestor em ${p.budget_date} US$ ${p.budget_used} (teto diário US$ 4). NÃ£o altera o orÃ§amento do Radar nem autoriza movimentaÃ§Ãµes.`;
    el('manager-inference').hidden=false;el('manager-paid').disabled=!p.ready;cycle();
    if(!p.ready)throw Error(p.errors.join(', '));
    el('manager-paid').scrollIntoView({block:'center',behavior:'smooth'});el('manager-paid').focus({preventScroll:true});
  }
  el('manager-prepare-form').addEventListener('submit',event=>{
    event.preventDefault();if(!data)return;
    const request={run:run(),proposal:command,cost_rate_pct:el('manager-cost').value}, cap=el('manager-budget').value;
    try{localStorage.setItem(COST,request.cost_rate_pct);}catch{}
    action(async v=>{
      dismiss();el('manager-status').textContent='Conferindo quÃ³rum, carteira e preÃ§osâ€¦';
      const d=await api('prepare',request);if(v!==version)return;selected=d.context.proposal;command=crypto.randomUUID().replaceAll('-','');
      await offer(v,cap);
    });
  });
  el('manager-prepare-form').addEventListener('input',()=>{version++;command=crypto.randomUUID().replaceAll('-','');dismiss();});
  el('manager-paid').addEventListener('change',()=>{el('manager-run').disabled=!report?.ready||!el('manager-paid').checked||busy;});
  el('manager-run').addEventListener('click',()=>{
    if(!report||!el('manager-paid').checked)return;
    const p={run:run(),proposal:selected,max_usd:report.max_usd,confirmation_token:report.confirmation_token,authorize_paid:true};
    action(async v=>{dismiss();await api('run',p);if(v!==version)return;await load();});
  });
  el('manager-replay').addEventListener('click',()=>action(async v=>{await api('replay',{run:run(),proposal:selected});if(v!==version)return;await load();}));
  el('manager-preview').addEventListener('click',()=>action(async v=>{
    dismiss();const p={run:run(),proposal:selected,economic_date:data.today};
    const d=await api('preview',p);if(v!==version)return;
    preview={...p,preview_token:d.preview_token,confirm:true};
    el('manager-effect').textContent=`Nada Ã© registrado agora. A ordem executa no ${auction(d.schedule)}, ao preÃ§o oficial B3 (ainda desconhecido); aprovaÃ§Ãµes atÃ© ${new Date(d.schedule.valid_until).toLocaleString('pt-BR')} valem para o pregÃ£o-alvo. Estimativa aos preÃ§os de referÃªncia: caixa ${money(d.before.cash)} â†’ ${money(d.after.cash)}; custos ${money(d.before.costs)} â†’ ${money(d.after.costs)}. Se o caixa nÃ£o bastar ao preÃ§o oficial, as compras serÃ£o reduzidas em aÃ§Ãµes inteiras.`;
    el('manager-quotes').innerHTML=quotesTable(d.quotes,d.schedule);
    needsAck=d.stale_alert.length>0;el('manager-stale').hidden=!needsAck;el('manager-stale-text').textContent=d.stale_alert.join(' ');
    el('manager-preview-box').hidden=false;cycle();el('manager-financial').focus();
  }));
  const approvable=()=>Boolean(preview)&&el('manager-financial').checked&&(!needsAck||el('manager-stale-ack').checked)&&!busy;
  el('manager-financial').addEventListener('change',()=>{el('manager-apply').disabled=!approvable();});
  el('manager-stale-ack').addEventListener('change',()=>{el('manager-apply').disabled=!approvable();});
  el('manager-apply').addEventListener('click',()=>{
    if(!approvable())return;
    const p=needsAck?{...preview,acknowledge_stale:true}:preview;
    action(async v=>{try{await api('apply',p);}catch(e){dismiss();throw e;} // refused: a new preview is required
      if(v!==version)return;dismiss();await load();el('manager-receipt').focus();});
  });
  el('manager-history').addEventListener('change',()=>{version++;selected=el('manager-history').value;dismiss();draw();});
  el('manager-refresh').addEventListener('click',()=>action(async()=>{dismiss();await load();}));
  el('radar-run').addEventListener('change',()=>{version++;selected='';clearTimeout(poll);dismiss();panel.hidden=true;load(true).catch(failure);});
  window.addEventListener('hfl:analysis-stage',event=>{if(event.detail!=='results'){version++;dismiss();}else{autoPrepared='';load().catch(failure);}});
  load().catch(failure);
})();
