'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let viewVersion=0;
const query=new URLSearchParams(location.search);
if(['CONSULTATIVE_SANDBOX','SYNTHETIC_DEMO'].includes(query.get('mode'))) $('radar-view').value=query.get('mode');
const readonly=()=>$('radar-view').value==='SYNTHETIC_DEMO'||state?.mutation_available===false;
function transfer(){ $('radar-to-global').href='/portfolio?'+new URLSearchParams({tickers:chosen().join(','),session:$('session').value,mode:$('radar-view').value})+'#global-workflow'; }
let state = null, csrf = '', selected = new Set(), report = null, poll = null;
const cash = value => Number(value || 0).toFixed(4);
const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) : '—';
const chosen = () => [...selected];
const selection = () => ({tickers:chosen(), session:$('session').value, max_usd:Number($('budget').value), replay:$('replay').checked});
const messages = {invalid_or_duplicate_ticker:'Ticker inválido ou já selecionado. Use um código de ação da B3, como PETR4.',select_one_to_five_tickers:'Selecione de um a cinco ativos.',invalid_budget:'Informe um orçamento maior que zero e de até US$ 5.',explicit_paid_authorization_required:'Autorize explicitamente o custo deste lote antes de executar.',preflight_or_confirmation_changed:'A seleção ou os dados mudaram. Faça um novo preflight.',radar_busy_or_stale_lock:'O radar está ocupado ou tem uma execução interrompida. Consulte o status antes de continuar.'};
function error(exc) { $('error').textContent = messages[exc.message] || exc.message || String(exc); $('error').hidden = false; }
function invalidate() { viewVersion++; transfer(); report = null; $('confirmation').hidden = true; $('paid').checked = false; $('preflight-result').textContent = 'Preflight necessário para confirmar este lote.'; }
async function api(path, payload) {
  if(payload!==undefined && readonly())throw Error('Demonstração V4 somente leitura.');
  let url='/api/radar/'+path;
  if(path==='status')url='/api/platform/radar-view?mode='+$('radar-view').value;
  if(path.startsWith('detail?'))url='/api/platform/radar-detail?mode='+$('radar-view').value+'&'+path.slice(7);
  const response = await fetch(url, payload === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify(payload)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Falha ao consultar radar.');
  return value;
}
const modeLabel = value => value === 'synthetic' ? 'SINTÉTICO · OFFLINE' : 'B3 · AJUSTADO';
function renderUniverse() {
  $('universe-count').innerHTML = `${state.universe.length} <small>/ 5 ativos</small>`;
  $('universe').innerHTML = state.universe.length ? state.universe.map(ticker => {
    const latest = state.items.filter(i => i.ticker === ticker).sort((a,b) => b.session.localeCompare(a.session))[0];
    return `<article class="asset"><div class="asset-top"><label><input type="checkbox" data-ticker="${escape(ticker)}" ${selected.has(ticker) ? 'checked' : ''}>${escape(ticker)}</label><button class="remove" ${readonly()?'disabled':''} data-remove="${escape(ticker)}" aria-label="Remover ${escape(ticker)}">×</button></div><small>${latest ? 'Dados: ' + escape(latest.session) + '<br>' + modeLabel(latest.mode) : 'Sem dados preparados'}</small></article>`;
  }).join('') : '<p class="muted">Adicione uma empresa para começar.</p>';
  $('prepare').disabled = $('preflight').disabled = readonly() || !selected.size || !!state.job && state.job.status === 'RUNNING';
}
function facts(row) {
  const facts = (row.votes || []).flatMap(v => v.signal.evidence || []);
  const supports = [...new Set(facts.filter(e => e.role.startsWith('SUPPORTS')).map(e => e.code))];
  const alerts = [...new Set(facts.filter(e => e.role === 'CAUTION').map(e => e.code))];
  return `${supports.map(escape).join(', ') || 'Sem evidência direcional'}${alerts.length ? '<small class="warning">Alertas: ' + alerts.map(escape).join(', ') + '</small>' : ''}`;
}
function renderResults() {
  $('results').innerHTML = state.items.length ? state.items.map(row => `<tr><td><button class="link" data-detail="${escape(row.ticker)}|${escape(row.session)}" ${row.status === 'INTEGRITY_ERROR' ? 'disabled' : ''}>${escape(row.ticker)}</button><small>${escape(row.session)}</small><small class="${row.mode === 'synthetic' ? 'warning' : ''}">${modeLabel(row.mode)}</small></td><td>${row.adjusted_close ? Number(row.adjusted_close).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'}</td><td>${row.consensus ? `${row.consensus.counts.COMPRA} / ${row.consensus.counts.VENDA} / ${row.consensus.counts.MANTER}` : '—'}</td><td>${escape(row.technical_signal?.signal)}<small>Confiança registrada: ${row.technical_signal ? Number(row.technical_signal.confidence).toFixed(2) : '—'}</small></td><td>${facts(row)}</td><td>${escape(row.risk?.verdict)}<small>Carteira: não avaliada</small></td><td><span class="pill">${escape(row.status)}</span><small>${escape(dateTime(row.generated_at))}</small></td></tr>`).join('') : '<tr><td colspan="7">Nenhuma análise registrada. Prepare dados para iniciar ou consulte um exemplo sintético.</td></tr>';
  const options = '<option value="">Selecione</option>' + state.items.filter(i => i.status === 'COMPLETED').map(i => `<option value="${escape(i.ticker)}|${escape(i.session)}">${escape(i.ticker)} · ${escape(i.session)} · ${modeLabel(i.mode)}</option>`).join('');
  ['compare-a','compare-b'].forEach(id => { const previous = $(id).value; $(id).innerHTML = options; $(id).value = previous; });
}
async function refresh(first=false) {
  const version=viewVersion,next=await api('status');if(version!==viewVersion)return;state=next;csrf=state.csrf_token;
  if (first) {
    const requested=(query.get('tickers')||'').split(',').filter(Boolean);
    if(requested.length>5||requested.some(t=>!/^([A-Z]{4}[3-8])$/.test(t))||new Set(requested).size!==requested.length)throw Error('Seleção inválida.');
    selected = new Set(requested.length?requested:state.universe); $('session').value = query.get('session')||state.last_closed_session;
    state.universe=[...new Set([...state.universe,...selected])].slice(0,5);
    $('mode').value=$('radar-view').value==='SYNTHETIC_DEMO'?'synthetic':'live';
    $('ticker-options').innerHTML = state.examples.map(t => `<option value="${escape(t)}"></option>`).join('');
  }
  $('closed').textContent = state.last_closed_session;
  $('budget-used').innerHTML = `${cash(state.global_budget_used)} <small>/ ${state.global_budget_cap.toFixed(2)}</small>`;
  $('job').textContent = state.job ? `${state.job.command} · ${state.job.status}` : 'Nenhuma execução ativa';
  $('radar-source').textContent=$('radar-view').value==='SYNTHETIC_DEMO'?'DEMONSTRAÇÃO SINTÉTICA · resultados V4 fixos · sem chamadas ou gravações nesta visualização.':'CONSULTIVO COM GEMINI · pareceres oficiais · custo e autorização próprios do Radar.'+(readonly()?' O runner aponta para outra raiz: execução bloqueada nesta visualização.':'');
  $('add-form').querySelectorAll('input,button').forEach(e=>e.disabled=readonly());
  $('mode').disabled=readonly();
  transfer();renderUniverse(); renderResults();
  if (state.job?.status === 'RUNNING' && !poll) poll = setInterval(() => refresh().catch(error), 2000);
  if (state.job?.status !== 'RUNNING' && poll) { clearInterval(poll); poll = null; }
  $('error').hidden=true;
  if (state.last_prepare?.items.some(i => i.status === 'BLOCKED')) {
    $('error').textContent = state.last_prepare.items.filter(i => i.status === 'BLOCKED').map(i => `${i.ticker}: ${i.error}` + (/split-like mismatch/.test(i.error) ? ` — evento corporativo (bonificação/desdobramento) reconhecido pelo yfinance como split. Preparar este ativo pelo comando normalizado: scripts/radar_corporate_events.py prepare --session ${i.session} --tickers ${i.ticker} (grava inputs; sem Gemini).` : '')).join(' · '); $('error').hidden = false;
  }
}
function guarded(handler) { return async event => { $('error').hidden = true; try { await handler(event); } catch(exc) { error(exc); } }; }
$('add-form').addEventListener('submit', guarded(async event => {
  event.preventDefault(); const ticker = $('ticker-search').value.toUpperCase().replace(/\.SA$/, '');
  await api('universe', {tickers:[...state.universe,ticker]}); selected.add(ticker); $('ticker-search').value = ''; invalidate(); await refresh();
}));
let searchTimer;
$('ticker-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(async () => { try { const result = await api('search?q=' + encodeURIComponent($('ticker-search').value)); $('ticker-options').innerHTML = result.tickers.map(t => `<option value="${escape(t)}"></option>`).join(''); $('catalog-note').textContent = result.note; } catch(exc) { error(exc); } }, 350); });
$('universe').addEventListener('change', event => { const ticker=event.target.dataset.ticker; if(ticker) { event.target.checked ? selected.add(ticker) : selected.delete(ticker); invalidate(); renderUniverse(); } });
$('universe').addEventListener('click', guarded(async event => { const ticker=event.target.closest('[data-remove]')?.dataset.remove; if(ticker) { await api('universe',{tickers:state.universe.filter(t=>t!==ticker)}); selected.delete(ticker); invalidate(); await refresh(); } }));
['session','budget','mode','replay'].forEach(id => $(id).addEventListener('change', invalidate));
$('prepare').addEventListener('click', guarded(async () => { invalidate(); await api('prepare',{tickers:chosen(),session:$('session').value,mode:$('mode').value}); await refresh(); }));
$('preflight').addEventListener('click', guarded(async () => {
  const version=viewVersion,next=await api('preflight',selection());if(version!==viewVersion)return;report=next;
  $('preflight-result').innerHTML = `<p><strong>${report.ready ? 'Preflight aprovado' : 'Preflight bloqueado'}</strong> · Sessão ${escape(report.session)}</p><ul>${report.items.map(i=>`<li>${escape(i.ticker)}: ${i.ready ? 'pronto · ' + modeLabel(i.mode) : escape(i.error)}</li>`).join('')}</ul><p>Estimativa do lote: <strong>US$ ${cash(report.usd_estimated)}</strong> · Teto reservado: <strong>US$ ${cash(report.usd_reserved)}</strong> · Limite global: US$ ${report.global_budget_cap.toFixed(2)}.</p><p class="muted">Até 6 chamadas por ativo. Estimativa baseada em 2.500 tokens de entrada e 800 de saída por chamada. Reserva conservadora: 32.768 de entrada e 8.192 de saída, incluindo pensamento, sem retries automáticos. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Tarifas e hipóteses</a>.</p>${report.usd_reserved > report.max_usd || report.global_budget_used + report.usd_reserved > report.global_budget_cap ? '<p class="warning">Orçamento insuficiente para a reserva conservadora do lote.</p>' : ''}`;
  $('confirmation').hidden = !report.ready;
  const paid = !report.replay && report.items.some(i=>i.mode==='live');
  $('paid').closest('label').hidden = !paid; $('paid').checked = false; $('execute').disabled = paid;
  $('execute').textContent = report.replay ? '3. Confirmar recuperação offline' : paid ? '3. Confirmar e executar chamadas pagas' : '3. Executar exemplo sintético · US$ 0';
}));
$('paid').addEventListener('change', () => { $('execute').disabled = !$('paid').checked; });
$('execute').addEventListener('click', guarded(async () => { if(!report?.ready) throw new Error('Refaça o preflight.'); const payload = {...selection(),confirmation_token:report.confirmation_token,authorize_paid:$('paid').checked,confirm:true}; invalidate(); await api('run',payload); await refresh(); }));
$('refresh').addEventListener('click', guarded(() => refresh()));
function detailHtml(row, compact=false) {
  if(row.status !== 'COMPLETED') return `<h3>${escape(row.ticker)} · ${escape(row.session)} · ${modeLabel(row.mode)}</h3><p class="warning">${escape(row.status)} · ${row.votes.length}/5 votos válidos gravados · ${row.reserved_calls} chamadas reservadas. Parecer final indisponível. Recuperação apenas offline; respostas ausentes nunca são substituídas.</p><details><summary>Votos parciais e histórico auditável</summary><pre>${escape(JSON.stringify(row,null,2))}</pre></details>`;

  return `<h3>${escape(row.ticker)} · ${escape(row.session)} <span class="pill">${modeLabel(row.mode)}</span></h3><p class="muted small">Geração: ${escape(dateTime(row.generated_at))} · Conclusão: ${escape(dateTime(row.completed_at))}</p><div class="room-summary"><div><strong>Parecer: ${escape(row.recommendation)}</strong><p>Consenso técnico: ${escape(row.technical_signal.signal)}<br>Votos C/V/M: ${row.consensus.counts.COMPRA}/${row.consensus.counts.VENDA}/${row.consensus.counts.MANTER}<br>Confiança qualitativa: ${Number(row.technical_signal.confidence).toFixed(2)}</p></div><div><strong>Risk: ${escape(row.risk.verdict)}</strong><p>${escape(row.risk.analysis)}<br>Volatilidade anualizada (21 sessões): ${(row.risk.risk_metrics.asset_volatility_21*100).toFixed(2)}%<br>Risco da carteira: NÃO AVALIADO.</p></div><div><strong>Auditoria</strong><p>Tokens: ${row.tokens.total_tokens} (pensamento: ${row.tokens.thoughts_tokens})<br>Custo: US$ ${cash(row.cost_usd)}<br>Portfolio Manager não invocado. Parecer sem ordem.</p></div></div>${compact ? facts(row) : `<div class="votes">${row.votes.map(v=>`<article class="vote"><span class="muted small">ANALISTA ${v.analyst_id}</span><strong>${escape(v.signal.signal)}</strong><small>Confiança: ${v.signal.confidence.toFixed(2)}</small><ul>${v.signal.evidence.map(e=>`<li>${escape(e.code)}<br>${escape(e.role)}</li>`).join('')}</ul></article>`).join('')}</div><details><summary>Dados, hashes e contrato de auditoria</summary><pre>${escape(JSON.stringify(row,null,2))}</pre></details>`}`;
}
$('results').addEventListener('click', guarded(async event => { const key=event.target.closest('[data-detail]')?.dataset.detail; if(!key)return; const [ticker,session]=key.split('|'); const row=await api(`detail?ticker=${encodeURIComponent(ticker)}&session=${session}`); $('room-content').innerHTML=detailHtml(row); $('room').hidden=false; $('room').scrollIntoView({behavior:'smooth',block:'start'}); $('room-title').tabIndex=-1; $('room-title').focus({preventScroll:true}); }));
$('close-room').addEventListener('click',()=>{$('room').hidden=true; $('results-title').tabIndex=-1; $('results-title').focus();});
$('compare').addEventListener('click', guarded(async () => {
  const keys=[$('compare-a').value,$('compare-b').value];
  const rows=keys.map(key=>state.items.find(i=>i.ticker+'|'+i.session===key));
  if(rows.some(r=>!r) || rows[0].ticker===rows[1].ticker) throw new Error('Selecione duas empresas diferentes.');
  if(rows[0].session!==rows[1].session || rows[0].mode!==rows[1].mode) { $('comparison').textContent=`Comparação bloqueada: sessões ou fontes diferentes (${rows[0].ticker}: ${rows[0].session}, ${modeLabel(rows[0].mode)}; ${rows[1].ticker}: ${rows[1].session}, ${modeLabel(rows[1].mode)}). Selecione a mesma sessão e fonte.`; return; }
  $('comparison').innerHTML=`<p class="muted small">Mesma sessão ${escape(rows[0].session)}; as gerações ocorreram nos horários individuais abaixo.</p><div class="side-by-side">${rows.map(r=>`<article class="comparison-card">${detailHtml(r,true)}</article>`).join('')}</div>`;
}));
$('radar-view').addEventListener('change',()=>{invalidate();$('error').hidden=true;$('room').hidden=true;$('comparison').textContent='';$('results').innerHTML='<tr><td colspan="7">Consultando a fonte selecionada…</td></tr>';$('radar-source').textContent='Consultando fonte…';$('prepare').disabled=$('preflight').disabled=true;refresh(true).catch(error);});
refresh(true).catch(error);
