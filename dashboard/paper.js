/* Prospective records only. Loading a page performs GETs; paid inference is an explicit POST. */
"use strict";
const $ = (id) => document.getElementById(id);
const ND = "N/D";
const esc = (v) => String(v ?? ND).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (v) => v == null ? ND : Number(v).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
const pct = (v, digits=2) => v == null ? ND : (v * 100).toLocaleString("pt-BR", {maximumFractionDigits:digits}) + "%";
const num = (v, digits=6) => v == null ? ND : Number(v).toLocaleString("pt-BR", {maximumFractionDigits:digits});
const day = (s) => /^\d{4}-\d{2}-\d{2}/.test(s || "") ? s.slice(0,10).split("-").reverse().join("/") : esc(s);
const stamp = (s) => s ? `${day(s)} ${esc(s.slice(11,16))}` : ND;
const chip = (v, cls="") => `<span class="chip ${cls}">${esc(v)}</span>`;
const TONE = {COMPRA:"buy",VENDA:"sell",MANTER:"hold",APROVADO:"buy",VETADO:"sell",PENDENTE:"warn",EXECUTADA:"buy",NAO_EXECUTAVEL:"sell",SEM_ORDEM:"sell"};
const signal = (v) => chip(v ?? "Sem sinal", `sig-${TONE[v] || "none"}`);
const facts = (rows, cls="") => `<dl class="${cls}">${rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
const empty = (title, text="") => `<div class="empty"><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ""}</div>`;
const signed = (v, fmt) => v == null ? ND : `${v > 0 ? "▲ +" : v < 0 ? "▼ " : ""}${fmt(v)}`;
const tone = (v) => v > 0 ? "good" : v < 0 ? "bad" : "flat";
const agentName = (id) => esc(`TA-${String(id).padStart(2,"0")}`);
const table = (headers, rows) => `<div class="scroll" tabindex="0" role="region" aria-label="Tabela rolável"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
// Validated categorical order (dark surface, adjacent pairs); dashes are the secondary encoding.
const COLORS = {ai:"#3987e5",buy_and_hold:"#d95926",sma_regime_h2_proposed:"#199e70",bollinger_state_h2_proposed:"#c98500",h2_v6_supervised:"#d55181"};
const DASH = {ai:[],buy_and_hold:[7,4],sma_regime_h2_proposed:[2,3],bollinger_state_h2_proposed:[10,3,2,3],h2_v6_supervised:[12,3]};
const ORDER = ["ai","h2_v6_supervised","buy_and_hold","sma_regime_h2_proposed","bollinger_state_h2_proposed"];
const STATES = {AGUARDANDO_APROVACAO:["Aguardando aprovação","warn"],APROVADA:["Aprovada","buy"],AJUSTADA_CONCENTRACAO:["Aprovada · ajustada por concentração","warn"],BLOQUEADA_VOLATILIDADE:["Bloqueada · volatilidade","sell"],PENDENTE_ABERTURA:["Aguardando abertura oficial","warn"],EXECUTADA:["Execução virtual confirmada","buy"],NAO_EXECUTADA_LIMITE_PRECO:["Não executada · limite de preço","sell"],NAO_EXECUTADA_GAP:["Não executada · gap","sell"],BLOQUEADA_BASE_PRECOS:["Bloqueada · base de preços","sell"],REJEITADA:["Rejeitada","sell"],CANCELADA:["Cancelada","hold"],EXPIRADA:["Expirada","hold"],SEM_ORDEM_NECESSARIA:["Sem ordem necessária","hold"],SEM_DECISAO:["Sem decisão","none"]};
const stateChip = (v) => `<span class="chip sig-${STATES[v]?.[1] || "none"}" title="${esc(v)}">${esc(STATES[v]?.[0] || v)}</span>`;
const LIMITS = {max_buy_price:["Preço máximo de compra (R$)",0.01],min_sell_price:["Preço mínimo de venda (R$)",0.01],max_gap_up:["Gap de alta máximo (%)",0.1],max_gap_down:["Gap de baixa máximo (%)",0.1],max_concentration:["Concentração máxima (%)",1],max_volatility:["Volatilidade máxima (%)",0.1]};
const PRICE_LIMITS = ["max_buy_price","min_sell_price"];
const LIMIT_HELP = {
  max_buy_price:["Preço bruto máximo por ação na abertura. Acima dele, a compra é bloqueada.","Ex.: 56 = até R$ 56,00 por ação."],
  min_sell_price:["Preço bruto mínimo por ação na abertura. Abaixo dele, a venda é bloqueada.","Ex.: 55 = a partir de R$ 55,00 por ação."],
  max_gap_up:["Alta máxima da abertura contra o fechamento bruto de referência. Uma alta maior bloqueia a operação.","Ex.: 2 = alta de até 2%."],
  max_gap_down:["Queda máxima da abertura contra a referência. Uma queda maior também bloqueia a compra, mesmo com preço mais barato.","Ex.: 2 = queda de até 2%."],
  max_concentration:["Peso máximo de PETR4 no patrimônio logo após a compra e os custos. Se já estiver no limite, não compra.","Ex.: 5 = 5%, cerca de R$ 5.000 em uma carteira de R$ 100.000; não é 50%."],
  max_volatility:["Volatilidade anualizada gravada pelo Risk Manager. Acima do máximo, ou sem esse dado, a operação é bloqueada.","Ex.: 40 = até 40% ao ano; não é a oscilação de hoje."]
};
const ROLE = {SUPPORTS_COMPRA:["Suporte à COMPRA","buy"],SUPPORTS_VENDA:["Suporte à VENDA","sell"],CAUTION:["Cautela","warn"],NEUTRAL:["Neutro","hold"]};
let supervisionView = null, pendingAction = null, wallets = [], latest = null, agentsData = null, records = [], selectedAgent = "TA-01", visible = null, charts = {}, decisionVersion = 0, refreshVersion = 0;
let scenarioTimer, scenarioController, marketController;

async function api(path, options) {
  const r = await fetch(`/api/forward/${path}`, {cache:"no-store",...options});
  const value = await r.json();
  if (r.status === 404 && value === null) return null;  // no record yet: render the empty state
  if (!r.ok) throw Error(value?.error || `HTTP ${r.status}`);
  return value;
}
function error(e) {
  $("error").hidden = false;
  $("error").innerHTML = `<p>Não foi possível concluir: ${esc(e.message)}. Nenhuma inferência é iniciada automaticamente.</p><button id="retry">Consultar novamente</button>`;
}

/* ── Navegação ─────────────────────────────────────────────── */
const VIEWS = ["visao","sala","mercado","carteiras","agentes"], LEGACY = {room:"sala",wallets:"carteiras"};
function route() {
  const hash = (typeof location === "undefined" ? "" : location.hash).slice(1);
  const view = VIEWS.includes(hash) ? hash : LEGACY[hash] || "visao";
  document.querySelectorAll("[data-view]").forEach(s => s.hidden = s.id !== view);
  document.querySelectorAll("[data-tab]").forEach(a => a.dataset.tab === view ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  if (view === "mercado") loadMarket();
}

/* ── Gráfico de patrimônio: 0, 1 ou 2+ observações ─────────── */
function equityChart(id, list) {
  const box = $(id);
  charts[id]?.destroy(); delete charts[id];
  const points = Math.max(0, ...list.map(w => w.curve.length));
  if (!list.length) { box.innerHTML = empty("Nenhuma estratégia comparável selecionada"); return; }
  if (points < 2) {
    box.innerHTML = `<div class="empty compact"><strong>${points ? `1 fechamento reconciliado · ${day(list[0].curve[0].session)}` : "Sem fechamentos reconciliados"}</strong>
      <p>${points ? "Todas partem do mesmo ponto. A curva aparece a partir do segundo fechamento reconciliado; não existem valores anteriores à inicialização." : "A curva começa no primeiro fechamento reconciliado."}</p>
      ${points ? `<ul class="start-points">${list.map(w=>`<li><span class="swatch" style="--series:${COLORS[w.key]}" aria-hidden="true"></span>${esc(w.label)} <strong>${money(w.curve[0].equity)}</strong></li>`).join("")}</ul>` : ""}</div>`;
    return;
  }
  box.innerHTML = `<div class="chart"><canvas role="img" aria-label="Patrimônio prospectivo por estratégia; valores na tabela abaixo"></canvas></div><details><summary>Valores do gráfico em tabela</summary>${table(["Estratégia","Sessão","Patrimônio"], list.flatMap(w=>w.curve.map(r=>[esc(w.label),day(r.session),money(r.equity)])))}</details>`;
  if (typeof Chart === "undefined") return;
  charts[id] = new Chart(box.querySelector("canvas"), {
    type:"line",
    data:{labels:list[0].curve.map(r=>day(r.session)), datasets:list.map(w=>({label:w.label,data:w.curve.map(r=>r.equity),borderColor:COLORS[w.key],backgroundColor:COLORS[w.key],borderDash:DASH[w.key],pointRadius:3,pointHoverRadius:5,borderWidth:2,tension:0}))},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:{labels:{color:"#c3c2b7",usePointStyle:true}},tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ${money(c.parsed.y)}`}}},
      scales:{x:{ticks:{color:"#a5a39b"},grid:{display:false}},y:{ticks:{color:"#a5a39b",callback:v=>money(v)},grid:{color:"#ffffff12"}}}}
  });
}

/* ── Visão Geral ───────────────────────────────────────────── */
function latestMark() { return wallets.map(w => w.mark?.session).filter(Boolean).sort().at(-1); }
function walletCard(w) {
  const head = `<div class="wallet-head"><h3><span class="swatch" aria-hidden="true"></span>${esc(w.label)}</h3>${w.supervision?.awaiting ? chip("Aguardando aprovação","sig-warn") : w.pending ? chip("Ordem pendente","sig-warn") : ""}</div>`;
  const last = w.trades?.at(-1);
  if (!w.available) return `<article class="card wallet" style="--series:${COLORS[w.key]}">${head}${empty("Sem carteira prospectiva", esc(w.reason))}</article>`;
  const stale = w.mark?.session < latestMark();
  return `<article class="card wallet" style="--series:${COLORS[w.key]}">${head}
    <div class="value">${money(w.equity)}</div>
    <p class="delta ${tone(w.return)}">${signed(w.return, pct)} · ${signed(w.pnl, money)}</p>
    ${facts([["PETR4 investido",money(w.marked_value)],["Caixa",money(w.cash)],["Exposição",pct(w.exposure)],["Custos",money(w.costs)],["Operações",num(w.trades.length)],["Última operação",last ? `${day(last.session)} · ${last.type === "BUY" ? "compra" : "venda"}` : "Nenhuma"],["Drawdown máx.",w.max_drawdown == null ? `${ND} <small>(2+ fechamentos)</small>` : pct(w.max_drawdown)]],"mini")}
    <small class="${stale || w.comparable === false ? "warn" : "muted"}">${stale ? "Sem novos dados desde" : "Marcação"} ${day(w.mark?.session)}${w.comparable === false ? " · fora da comparação" : ""}</small></article>`;
}
function renderOverviewChart() {
  const comparable = wallets.filter(w => w.available && w.comparable !== false);
  visible ??= new Set(comparable.map(w => w.key));
  // Toggles only exist when there is a curve for them to change.
  $("overview-series").innerHTML = comparable.some(w => w.curve.length > 1) ? comparable.map(w=>`<label class="toggle"><input type="checkbox" data-series="${esc(w.key)}" ${visible.has(w.key) ? "checked" : ""} /><span class="swatch" style="--series:${COLORS[w.key]}" aria-hidden="true"></span>${esc(w.label)}</label>`).join("") : "";
  equityChart("overview-chart", comparable.filter(w => visible.has(w.key)));
}
function renderLastDecision(d) {
  if (!d?.consensus) { $("last-decision").innerHTML = `<h2>Última deliberação</h2>${empty("Nenhuma decisão prospectiva registrada", d ? `Sessão ${day(d.session)}: ${esc(d.status)}.` : "Prepare os dados e execute o preflight na Sala de Decisão.")}<a class="action" href="#sala">Abrir Sala de Decisão →</a>`; return; }
  const c = d.consensus, ai = wallets.find(w => w.key === "ai");
  $("last-decision").innerHTML = `<div class="card-head"><h2>Última deliberação</h2>${chip(d.status)}</div>
    ${facts([["Ativo",esc(d.ticker)],["Data de referência",`${day(d.session)} · fechamento`],["Consenso",`${signal(c.consensus_reached ? c.technical_outcome : "SEM CONSENSO")} ${esc(c.signal?.justification)}`],["Risk Manager",signal(d.risk?.verdict)],["Portfolio Manager",`${signal(d.portfolio?.decision)} alvo ${pct(d.portfolio?.target_weight)}`],["Ordem",`${chip(d.order?.label, `sig-${TONE[d.order?.state] || "none"}`)} <small class="muted">${esc(d.order?.detail)}</small>`]])}
    <div class="split"><div class="intent"><small>Sinal futuro · abertura de ${day(d.target_session)}</small><strong>Alvo ${pct(d.portfolio?.target_weight)} em PETR4</strong></div>
    <div class="actual"><small>Posição executada · marcação ${day(ai?.mark?.session)}</small><strong>${pct(ai?.exposure)} PETR4 · ${pct(ai?.composition?.[1]?.weight)} caixa</strong></div></div>
    <a class="action" href="#sala">Abrir Sala de Decisão →</a>`;
}
function renderOverview() {
  $("overview-wallets").innerHTML = wallets.length ? wallets.map(walletCard).join("") : empty("Nenhuma carteira prospectiva", "O ledger da IA ainda não foi inicializado.");
  renderOverviewChart();
  renderLastDecision(latest);
  $("updated").textContent = `Última marcação: ${latestMark() ? day(latestMark()) : ND}${latest?.generated_at ? ` · última decisão gerada em ${stamp(latest.generated_at)}` : ""}`;
}

/* ── Sala de Decisão ───────────────────────────────────────── */
function analystCard(i, calls) {
  const last = calls.at(-1);
  const status = !last ? "Sem resposta gravada" : last.status === "ok" ? `Resposta válida${last.retry_count ? ` · ${last.retry_count} retry` : ""}` : `Resposta inválida${last.error_type ? ` · ${esc(last.error_type)}` : ""}`;
  return `<article class="card analyst${last?.signal ? "" : " missing"}">
    <div class="who"><span class="avatar" aria-hidden="true">TA<b>${i}</b></span><div><h3>${agentName(i)}</h3><small>Technical Analyst</small></div></div>
    ${signal(last?.signal)}
    ${last?.confidence != null ? `<div class="meter" aria-hidden="true"><span style="width:${last.confidence * 100}%"></span></div><small>Confiança registrada <strong>${num(last.confidence, 2)}</strong></small>` : "<small>Confiança N/D</small>"}
    <small class="${last?.status === "ok" ? "muted" : "warn"}">${status}</small>
    ${calls.length ? `<details><summary>Ver análise de ${agentName(i)}</summary>${calls.map(a=>`<ul class="evidence-list">${a.evidence.map(e=>`<li>${chip(ROLE[e.role]?.[0] || e.role, `sig-${ROLE[e.role]?.[1] || "none"}`)} ${esc(e.label)}</li>`).join("")}</ul><details><summary>Texto original gravado</summary><p class="quote">${esc(a.explanation)}</p></details><small class="muted">Registro #${esc(a.sequence)} · ${esc(a.status)}</small>`).join("<hr/>")}</details>` : ""}
  </article>`;
}
function quorumCard(d) {
  const c = d.consensus || {}, k = d.committee || {}, counts = c.vote_counts || {}, n = k.analyst_count || 0;
  const den = k.require_all_votes ? n : c.valid_votes;
  const [top, topCount] = Object.entries(counts).sort((a,b) => b[1] - a[1])[0] || [null, 0];
  const share = den ? topCount / den : null;
  const winners = d.analysts.filter(a => a.signal === top && a.confidence != null);
  const mean = winners.length ? winners.reduce((s,a) => s + a.confidence, 0) / winners.length : null;
  const slots = Array.from({length:n}, (_,i) => d.analysts.filter(a => Number(a.analyst_id) === i + 1).at(-1)?.signal);
  return `<article class="card quorum"><h2>Quórum do comitê</h2>
    <div class="pips" role="img" aria-label="${slots.map((v,i)=>`${agentName(i+1)}: ${v || "sem voto"}`).join("; ")}">${slots.map(v=>`<span class="pip sig-${TONE[v] || "none"}"></span>`).join("")}</div>
    <div class="vote-bars">${["COMPRA","VENDA","MANTER"].map(s=>`<div class="vote-row"><span>${s}</span><div class="track" aria-hidden="true"><span class="sig-${TONE[s]}" style="width:${n ? (counts[s] || 0) / n * 100 : 0}%"></span></div><strong>${counts[s] ?? 0}</strong></div>`).join("")}</div>
    <div class="threshold"><div class="track" aria-hidden="true"><span style="width:${(share || 0) * 100}%"></span><i style="left:${(c.consensus_threshold || 0) * 100}%"></i></div>
    <p>Sinal mais votado: <strong>${pct(share)}</strong> · limiar exigido <strong>${pct(c.consensus_threshold)}</strong>${k.require_all_votes ? " · todas as respostas exigidas" : ""}</p></div>
    <p class="result">Resultado agregado ${signal(c.consensus_reached ? c.technical_outcome : c.consensus_reached === false ? "SEM CONSENSO" : null)}</p>
    <p>Confiança coletiva registrada <strong>${num(c.signal?.confidence, 4)}</strong>${mean != null && share != null && c.consensus_reached ? ` <small class="muted">= ${num(mean, 4)} × ${topCount}/${den}</small>` : ""}</p>
    <p class="muted small">O agregador multiplica a média das confianças dos votos vencedores pela fração do comitê nesse sinal. É a autoavaliação registrada pelo modelo, não uma probabilidade de acerto.</p></article>`;
}
function synthesis(d) {
  const n = d.committee?.responded || 0, outcome = d.consensus?.technical_outcome;
  // Favorable/contrary only have a referent for a directional outcome (see forward_api.stance).
  const groups = ["COMPRA","VENDA"].includes(outcome)
    ? [["favorable",`Favoráveis à ${outcome}`,"buy"],["caution","Cautela","warn"],["contrary",`Contrárias à ${outcome}`,"sell"],["neutral","Neutras","hold"]]
    : [["supports_compra","Suporte à COMPRA","buy"],["supports_venda","Suporte à VENDA","sell"],["caution","Cautela","warn"],["neutral","Neutras","hold"]];
  const items = d.evidence_summary || [];
  const col = ([key,title,cls]) => { const list = items.filter(e => e.stance === key); return `<div class="stance"><h3>${chip(title,`sig-${cls}`)}</h3>${list.length ? `<ul>${list.map(e=>`<li><span>${esc(e.label)}</span><span class="freq" aria-hidden="true"><span style="width:${n ? e.count / n * 100 : 0}%"></span></span><small>${e.count}/${n} analistas · ${e.analysts.map(agentName).join(", ")}</small></li>`).join("")}</ul>` : '<p class="muted">Nenhuma.</p>'}</div>`; };
  return `<article class="card"><div class="card-head"><h2>Por que os agentes decidiram isso?</h2><small class="muted">Derivado das evidências estruturadas gravadas · nenhuma nova chamada ao modelo</small></div>
    ${items.length ? `<div class="stances">${groups.map(col).join("")}</div>` : empty("Sem evidências estruturadas gravadas")}
    <h3>Divergências entre agentes</h3>${(d.divergences || []).length ? `<ul class="divergences">${d.divergences.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="muted">${n ? "Nenhuma divergência: votos e classificações das evidências coincidem. Diferenças de frequência indicam apenas quantos analistas citaram cada evidência." : "Sem respostas válidas para comparar."}</p>`}</article>`;
}
function renderDecision(d) {
  if (!d) { $("decision").innerHTML = empty("Nenhuma sessão prospectiva registrada", "Atualize os dados para preparar a primeira entrada."); return; }
  if (!d.consensus) { $("decision").innerHTML = empty(`Sessão ${day(d.session)} · ${d.status}`, d.status === "MISSED" ? "Nenhuma decisão foi registrada antes da abertura seguinte; posição mantida." : "Input preparado, sem decisão gravada.") + '<div id="supervision-panel"></div>'; renderSupervision(d); return; }
  const risk = d.risk || {}, p = d.portfolio || {}, n = d.committee?.analyst_count || 0;
  const flow = (d.flow || []).map(s=>`<li><small>${esc(s.stage)}</small>${signal(s.result)}<p>${esc(s.detail)}</p>${s.changed === false ? '<span class="tag">Não alterou</span>' : s.changed ? '<span class="tag warn">Alterou</span>' : ""}</li>`).join("");
  $("decision").innerHTML = `<div class="meta">${chip(d.status)} ${chip(d.ticker || "PETR4.SA")} <span>Referência <strong>${day(d.session)}</strong></span><span>Fechamento usado <strong>${money(d.close_used)}</strong></span><span>Abertura-alvo <strong>${day(d.target_session)} ${esc(d.target_open_deadline?.slice(11,16) || "")}</strong></span><span class="muted">${d.replayed_from_journal ? "Replay offline do journal" : "Gerada em"} ${stamp(d.generated_at)}</span></div>
    ${d.failure ? `<p class="callout bad">${esc(d.failure)}</p>` : ""}
    <ol class="flow" aria-label="Fluxo da decisão">${flow}</ol>
    <div id="supervision-panel"></div>
    <div class="room-grid"><div><h2>Comitê técnico · ${n} analistas</h2><div class="analysts">${Array.from({length:n}, (_,i) => analystCard(i + 1, d.analysts.filter(a => Number(a.analyst_id) === i + 1))).join("")}</div></div>${quorumCard(d)}</div>
    ${synthesis(d)}
    <div class="pair"><article class="card"><h2>Risk Manager</h2><p>${signal(risk.verdict)} ${chip(risk.risk_source)} ${risk.veto_effect ? chip(`Veto ${risk.veto_effect}`) : ""}</p><p>${esc(risk.analysis)}</p>${table(["Regra","Valor","Limite","Estado"], (risk.rules || []).map(r=>[esc(r.rule),num(r.value),`${esc(r.operator)} ${num(r.limit)}`,chip(r.status, r.status === "PASSOU" ? "sig-buy" : r.status === "DISPAROU" ? "sig-sell" : "")]))}</article>
    <article class="card"><h2>Portfolio Manager</h2><p>${signal(p.decision)} ${chip(p.final_cause)}</p><p>${esc(p.reasoning)}</p>
      <h3>Da recomendação à execução</h3>${facts([["Sinal técnico",signal(d.consensus.technical_outcome)],["Decisão final",signal(p.decision)],["Ordem pretendida",d.intent_weight == null ? "Nenhuma" : `Alvo ${pct(d.intent_weight)} PETR4`],["Ordem pendente",d.pending ? `Sim · abertura ${day(d.pending.target_session)}` : "Não"],["Ordem executada",d.execution ? `${day(d.execution.session)} · ${d.execution.trades.length} operação(ões)` : "Ainda não observada"],["Não executável",d.status === "LATE_NOT_EXECUTABLE" ? "Sim · decisão após a abertura" : "Não"],["Posição no fechamento",pct(p.observed_weight)]])}
      <p class="muted small">A posição-alvo é uma recomendação para a próxima abertura. A composição financeira atual está em Carteiras.</p></article></div>`;
  renderSupervision(d);
}

/* ── Supervisão Humana ─────────────────────────────────────── */
function remaining(deadline, now) {
  const minutes = Math.floor((new Date(deadline) - new Date(now)) / 60000);
  return minutes <= 0 ? "prazo encerrado" : `restam ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
function limitText(key, value) {
  return `${esc(LIMITS[key]?.[0].replace(/ \(.*\)/, "") || key)} ${PRICE_LIMITS.includes(key) ? money(value) : pct(value)}`;
}
function renderSupervision(d) {
  const box = $("supervision-panel");
  if (!box) return;
  const s = supervisionView, intro = '<p class="muted small">Carteira H2 v6 Supervisionada · paper trading. Aprovar ou rejeitar uma ordem não chama o Gemini e não altera a H2 v6 original.</p>';
  const head = (state) => `<div class="card-head"><h2>Supervisão Humana</h2>${state ? stateChip(state) : ""}</div>${intro}`;
  if (!s?.initialized) { box.innerHTML = `<article class="card supervision">${head()}${empty("Carteira supervisionada não inicializada", esc(s?.reason || "Consulte os registros."))}</article>`; return; }
  const p = s.selected;
  if (!p || p.decision_session !== d.session) { box.innerHTML = `<article class="card supervision">${head()}${empty("Sem proposta supervisionada para esta sessão", "Use “Sincronizar carteira supervisionada” em Operação depois da decisão dos agentes, antes do prazo da abertura.")}</article>`; return; }
  const a = p.approval, o = p.outcome, open = p.order_state === "AGUARDANDO_APROVACAO" && new Date(s.now) < new Date(p.deadline);
  const limits = a ? (Object.keys(a.limits || {}).length ? Object.entries(a.limits).map(([k,v]) => chip(limitText(k, v))).join(" ") : "Nenhum limite adicional") : "—";
  const waiting = {AGUARDANDO_APROVACAO:"Decisão humana até o prazo", APROVADA:"Abertura oficial e verificação dos limites", AJUSTADA_CONCENTRACAO:"Abertura oficial e verificação dos limites", PENDENTE_ABERTURA:"Reconciliação com a abertura oficial, disponível após o fechamento"}[p.order_state] || "Nenhuma";
  const c = d.consensus || {};
  box.innerHTML = `<article class="card supervision">${head(p.order_state)}
    <div class="pair">${facts([["Ativo",esc(d.ticker)],["Data de referência",day(p.decision_session)],["Decisão dos agentes",`${signal(d.portfolio?.decision)} <small class="muted">${esc(p.final_cause)}</small>`],["Consenso",`${signal(c.consensus_reached ? c.technical_outcome : "SEM CONSENSO")} ${esc(c.signal?.justification || "")}`],["Risk Manager",signal(d.risk?.verdict)],["Portfolio Manager",signal(d.portfolio?.decision)]])}
    ${facts([["Posição supervisionada no fechamento",pct(p.weight_at_close)],["Carteira supervisionada agora",`${pct(s.position.weight)} PETR4 · ${money(s.position.equity)}`],["Posição-alvo recomendada",p.recommended_target == null ? "Nenhuma ordem" : `${pct(p.recommended_target)} PETR4`],["Prazo de validade",p.deadline ? `${stamp(p.deadline)}${open ? ` · ${remaining(p.deadline, s.now)}` : ""}` : ND],["Fechamento bruto oficial",money(p.raw_close)]])}</div>
    <h3>Da recomendação à ordem supervisionada</h3>
    <ol class="ladder">
      <li><small>Recomendação original</small><div>${signal(p.direction && !["VETO"].includes(p.direction) ? p.direction : d.portfolio?.decision)} ${esc(p.reason)}</div></li>
      <li><small>Decisão do operador</small><div>${a ? `${chip(a.action === "APPROVE" ? "Aprovou" : "Rejeitou", a.action === "APPROVE" ? "sig-buy" : "sig-sell")} ${stamp(a.created_at)}${p.cancel ? ` · ${chip("Cancelou","sig-hold")} ${stamp(p.cancel.created_at)}` : ""}` : open ? "Aguardando" : "Nenhuma"}</div></li>
      <li><small>Limites aplicados</small><div>${limits}${a?.effect ? ` <span class="muted">${esc(a.effect.reason)}</span>` : ""}</div></li>
      <li><small>Condições pendentes</small><div>${esc(waiting)}</div></li>
      <li><small>Status da ordem</small><div>${stateChip(p.order_state)}</div></li>
      <li><small>Resultado da reconciliação</small><div>${o ? `${esc(o.reason)}${o.prices ? `<br/><span class="muted small">Abertura bruta ${money(o.prices.raw_open)} (${esc(o.prices.raw_source)}) · ajustada ${money(o.prices.adjusted_open)} · gap bruto ${pct(o.prices.raw_gap)}</span>` : ""}` : "Ainda não reconciliada"}</div></li>
    </ol>
    ${["COMPRA","VENDA"].includes(p.direction) && p.recommended_target != null ? limitsForm(p, s, open) : ""}
    ${["APROVADA","AJUSTADA_CONCENTRACAO"].includes(p.order_state) && new Date(s.now) < new Date(p.deadline) ? '<div class="row"><button type="button" data-action="cancel">Cancelar aprovação</button><span class="muted small">Registra um evento de cancelamento; a aprovação original permanece.</span></div>' : ""}
    <p class="muted small">${s.audit.ok ? `Cadeia de auditoria íntegra · ${s.audit.events} eventos` : `<span class="bad">Auditoria com divergências: ${esc(s.audit.errors.join("; "))}</span>`}</p></article>`;
  preview(false);
}
function limitsForm(p, s, open) {
  const fields = Object.entries(s.limits_schema).filter(([, v]) => !v.direction || v.direction === p.direction);
  return `<form id="sup-form" class="limits" novalidate><div class="card-head"><h3>Limites e cenários de abertura</h3>${chip("HIPOTÉTICO · SEM GRAVAÇÃO","sig-warn")}</div>
    <p class="muted">Campos vazios não acrescentam restrições. Testar cenários é independente da aprovação real.${!open ? " Os limites abaixo são uma cópia para testes; não editam a ação já registrada." : " A aprovação exige a confirmação humana ao final."}</p>
    <div class="limit-grid">${fields.map(([k]) => `<label for="limit-${k}">${esc(LIMITS[k][0])}<input id="limit-${k}" type="number" data-limit="${k}" min="0" max="${PRICE_LIMITS.includes(k) ? s.limits_schema[k].max : s.limits_schema[k].max * 100}" step="${LIMITS[k][1]}" value="${p.approval?.limits?.[k] == null ? "" : p.approval.limits[k] * (PRICE_LIMITS.includes(k) ? 1 : 100)}" inputmode="decimal" aria-describedby="help-${k}" /><span id="help-${k}" class="limit-help">${esc(LIMIT_HELP[k][0])}<small>${esc(LIMIT_HELP[k][1])}</small></span><span id="applied-${k}" class="applied">Aplicado: ${p.approval?.limits?.[k] == null ? "sem limite adicional" : PRICE_LIMITS.includes(k) ? money(p.approval.limits[k]) : pct(p.approval.limits[k])}</span></label>`).join("")}</div>
    <div id="sup-preview" class="preview" role="status"></div>
    <div class="scenario-entry"><label for="hypothetical-open">Abertura hipotética bruta (R$ por ação)<input id="hypothetical-open" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" placeholder="${esc(p.raw_close)}" /></label><button type="button" id="simulate-opening">Testar abertura · grátis</button></div>
    <div id="scenario-result" aria-live="polite"></div>
    <p class="muted small">Nenhuma chamada LLM, aprovação ou ordem é criada pelo simulador. Os limites usam preços brutos; os valores financeiros usam a base ajustada do ledger.</p>
    ${open ? '<div class="row"><button type="button" class="primary" data-action="approve">APROVAR RECOMENDAÇÃO</button><button type="button" data-action="reject">REJEITAR RECOMENDAÇÃO</button></div>' : ""}</form>`;
}
function readLimits() {
  const limits = {};
  for (const input of document.querySelectorAll("#sup-form [data-limit]")) {
    if (input.value === "") continue;
    const key = input.dataset.limit, value = Number(input.value);
    if (input.max && value > Number(input.max)) return {error:`${LIMITS[key][0]}: máximo permitido ${input.max}.`};
    if (!Number.isFinite(value) || value <= 0) return {error:`${LIMITS[key][0]}: informe um número positivo.`};
    limits[key] = PRICE_LIMITS.includes(key) ? value : value / 100;
  }
  return {limits};
}
function preview(query=true) {
  const box = $("sup-preview");
  if (!box || !supervisionView?.selected) return;
  const {limits, error: problem} = readLimits();
  box.innerHTML = problem ? `<span class="bad">${esc(problem)}</span>` : '<span class="muted">Preencha os limites para consultar a faixa permitida. Valores em %: digite 5 para aplicar 5%.</span>';
  if (!query) return;
  clearTimeout(scenarioTimer); scenarioController?.abort();
  $("scenario-result").innerHTML = "";
  if (!problem) scenarioTimer = setTimeout(() => evaluateScenario(null), 300);
}
function openingBand(band) {
  const lo = band.lower > 0 ? money(band.lower) : "Sem piso adicional", hi = band.upper == null ? "Sem teto adicional" : money(band.upper);
  return `<div class="opening-band ${band.empty ? "blocked" : ""}" role="img" aria-label="${esc(band.empty ? "Faixa vazia, limites contraditórios" : `Faixa inclusiva: ${lo} a ${hi}`)}"><span>${band.empty ? "Nenhum preço permitido" : "Faixa bruta permitida · extremos inclusivos"}</span><div class="band-line"></div><div class="band-ends"><strong>${lo}</strong><strong>${hi}</strong></div></div>`;
}
function renderScenario(r, previewOnly) {
  const box = $("sup-preview");
  box.innerHTML = openingBand(r.band) + (r.band.redundant_gap_up ? '<span>O preço máximo de compra já é mais restritivo: o gap de alta é redundante nesta combinação.</span>' : "") + (r.limits.max_gap_down ? '<span>O gap de baixa também bloqueia preços mais baratos quando a queda supera o limite.</span>' : "") + (r.limits.max_concentration ? `<span>Concentração aplicada: ${pct(r.limits.max_concentration)}. Valor máximo aproximado ao fechamento: ${money(r.concentration_amount_at_mark)}, sobre ${money(r.current_position.equity)}. A compra adicional desconta a posição existente e os custos.</span>` : "") + `<span class="muted">${esc(r.pre_open_effect?.reason || r.reason)}</span>`;
  for (const key of Object.keys(LIMITS)) {
    const field = $("applied-" + key);
    if (field) field.textContent = r.limits[key] == null ? "Aplicado: sem limite adicional" : `Aplicado: ${PRICE_LIMITS.includes(key) ? money(r.limits[key]) : pct(r.limits[key])}`;
  }
  if (previewOnly) return;
  const e = r.estimate || {};
  $("scenario-result").innerHTML = `<article class="scenario-output"><div class="card-head"><h3>Cenário hipotético · ${esc(r.direction)}</h3>${chip(r.allowed ? "PERMITIDA NO CENÁRIO" : "BLOQUEADA NO CENÁRIO",r.allowed ? "sig-buy" : "sig-sell")}</div><p>${esc(r.reason)}</p>
    <div class="pair">${facts([["Fechamento bruto de referência",money(r.reference)],["Abertura hipotética bruta",money(r.hypothetical_open)],["Gap hipotético",signed(r.gap,pct)],["Exposição-alvo",pct(r.target_weight)],["Valor estimado da ordem",money(e.order_value)],["Quantidade fracionária estimada",num(e.quantity)]])}${facts([["Custos estimados",money(e.cost)],["Caixa após o cenário",money(e.cash_after)],["Patrimônio na abertura após custos",money(e.equity_after)],["Concentração após custos",pct(e.concentration_after_costs,6)],["Preço ajustado estimado",money(e.adjusted_open)],["Fator ajustado / bruto conhecido",num(e.adjustment_factor)]])}</div>
    ${r.band.checks.length ? table(["Condição","Valor aplicado","Estado"],r.band.checks.map(c=>[esc(LIMITS[c.key]?.[0] || c.key),PRICE_LIMITS.includes(c.key) ? money(c.limit) : pct(c.limit),chip(c.passed === true ? "Dentro do limite" : c.passed === false ? "Fora do limite" : "Dados insuficientes",c.passed === true ? "sig-buy" : c.passed === false ? "sig-sell" : "sig-warn")])) : '<p class="muted">Sem limites adicionais.</p>'}
    <p class="muted small">${esc(r.assumption)}</p><small>${esc(e.source || "Valores financeiros indisponíveis para este cenário.")}</small></article>`;
}
async function evaluateScenario(price) {
  const p = supervisionView?.selected, version = decisionVersion;
  const {limits, error: problem} = readLimits();
  if (!p || problem) { preview(false); return; }
  if (!csrf) { $("sup-preview").textContent = "Aguardando conexão local para consultar o cenário."; return; }
  scenarioController?.abort(); scenarioController = new AbortController();
  const controller = scenarioController;
  if (price !== null) $("scenario-result").innerHTML = '<p class="muted">Calculando cenário hipotético…</p>';
  try {
    const r = await api("scenario", {method:"POST", signal:controller.signal, headers:{"Content-Type":"application/json","X-CSRF-Token":csrf}, body:JSON.stringify({decision_session:p.decision_session,decision_sha256:p.decision_sha256,limits,hypothetical_open:price})});
    if (controller.signal.aborted || version !== decisionVersion) return;
    renderScenario(r, price === null);
  } catch(e) { if (e.name !== "AbortError" && version === decisionVersion) $("sup-preview").innerHTML = `<span class="bad">Cenário indisponível: ${esc(e.message)}</span>`; }
}
async function loadMarket() {
  marketController?.abort(); marketController = new AbortController();
  const controller = marketController;
  $("market-content").innerHTML = '<p class="state">Consultando registros locais…</p>';
  try {
    const m = await api("market", {signal:controller.signal});
    if (controller.signal.aborted) return;
    const c = m.official_close || {}, q = m.intraday || {}, i = m.indicators || {};
    const classification = {realtime_verified:"Tempo real comprovado",delayed:"Atrasada",official_close:"Fechamento oficial",unknown:"Desconhecida"};
    $("market-content").innerHTML = `<div class="market-grid"><article class="card"><div class="card-head"><h2>${esc(m.ticker)} · fechamento de referência</h2>${chip("FECHAMENTO OFICIAL","sig-hold")}</div><p class="market-price">${money(c.price)}</p>${facts([["Sessão do fechamento",day(c.session)],["Procedência",esc(c.source)],["Coleta registrada",stamp(c.timestamp)],["Próxima abertura prevista",stamp(m.session.expected_open)],["Próxima sessão B3",day(m.session.next_session)],["Sessão pelo relógio",chip(m.session.state,"sig-warn")]])}<p class="muted small">${esc(c.timestamp_basis || m.data_issue)}</p><p class="muted small">${esc(m.session.basis)}</p>${c.stale ? '<p class="warn">Fechamento local desatualizado para a última sessão encerrada.</p>' : ""}</article>
    <article class="card"><div class="card-head"><h2>Cotação intradiária</h2>${chip(classification[q.classification],"sig-warn")}</div>${q.price == null ? empty("Cotação intradiária indisponível","O fechamento histórico ao lado não é uma cotação em tempo real.") : `<p class="market-price">${money(q.price)}</p>${facts([["Timestamp do provider",stamp(q.timestamp)],["Variação contra fechamento",signed(q.change_vs_close,pct)]])}`}${facts([["Fonte",esc(q.source)],["Atualização",esc(classification[q.classification])],["Consulta local",stamp(m.as_of)]])}${q.stale ? '<p class="warn">Informação desatualizada.</p>' : ""}<p class="muted">${esc(m.refresh)}</p><p class="muted small">Uma cotação atrasada não identifica o preço oficial do leilão nem confirma execução.</p></article></div>
    <article class="card"><div class="card-head"><h2>Condições aprovadas</h2>${chip("SOMENTE INFORMATIVO","sig-warn")}</div>${m.approved_conditions.length ? m.approved_conditions.map(p=>`<h3>${esc(p.direction)} · abertura-alvo ${day(p.target_session)} ${chip(p.state,p.state === "Fora do limite" ? "sig-sell" : "sig-warn")}</h3>${openingBand(p.band)}${table(["Limite aprovado","Valor","Cotação observada"],p.band.checks.map(c=>[esc(LIMITS[c.key]?.[0]),PRICE_LIMITS.includes(c.key) ? money(c.limit) : pct(c.limit),c.passed === true ? "Dentro do limite" : c.passed === false ? "Fora do limite" : "Dados insuficientes"]))}<p class="muted small">${esc(p.note)}</p>`).join("") : empty("Nenhuma condição aprovada ativa","A primeira recomendação continua dependendo da decisão humana na Sala de Decisão.")}<p class="muted">${esc(m.execution_authority)}</p>${m.audit && !m.audit.ok ? '<p class="bad">Auditoria com divergências; não use estes registros para decidir.</p>' : ""}</article>
    <article class="card"><div class="card-head"><h2>Indicadores do fechamento</h2>${chip("HISTÓRICO · BASE AJUSTADA","sig-hold")}</div>${facts([["Sessão de referência",day(i.session)],["SMA50 · R$ ajustados",money(i.sma50)],["SMA200 · R$ ajustados",money(i.sma200)],["RSI14 · pontos de 0 a 100",num(i.rsi,2)],["MACD 12/26 · R$ ajustados",num(i.macd,4)],["Sinal MACD9 · R$ ajustados",num(i.macd_signal,4)],["Volatilidade anualizada gravada",pct(i.volatility)]])}<p class="muted small provenance">${esc(i.source || m.data_issue)}</p><p class="muted small">Indicadores derivados da série congelada; não são recalculados com cotações intradiárias.</p></article>`;
  } catch(e) { if (e.name !== "AbortError") $("market-content").innerHTML = empty("Mercado indisponível",esc(e.message)); }
}
function askSupervision(action) {
  const p = supervisionView?.selected;
  if (!p || posting) return;
  const {limits, error: problem} = action === "approve" ? readLimits() : {limits:null};
  if (problem) { preview(); return; }
  const payload = {confirm:true, decision_session:p.decision_session, decision_sha256:p.decision_sha256, ...(action === "approve" ? {limits} : {})};
  pendingAction = {action, payload};
  const names = {approve:"Aprovar recomendação", reject:"Rejeitar recomendação", cancel:"Cancelar aprovação"};
  $("sup-title").textContent = names[action];
  $("sup-details").innerHTML = facts([["Sessão",day(p.decision_session)],["Recomendação",`${signal(p.direction)} alvo ${pct(p.recommended_target)}`],["Limites",action === "approve" ? (Object.keys(limits).length ? Object.entries(limits).map(([k,v]) => chip(limitText(k, v))).join(" ") : "Nenhum") : "—"],["Decisão SHA256",esc(p.decision_sha256.slice(0,12))],["Prazo",stamp(p.deadline)]]);
  $("sup-accept").checked = false; $("sup-submit").disabled = true;
  $("sup-dialog").showModal();
}
async function confirmSupervision() {
  if (!pendingAction || !$("sup-accept").checked || posting) return;
  const {action, payload} = pendingAction;
  pendingAction = null; posting = true; $("sup-dialog").close(); $("error").hidden = true;
  try {
    await api(`supervision/${action}`, {method:"POST", headers:{"Content-Type":"application/json","X-CSRF-Token":csrf}, body:JSON.stringify(payload)});
  } catch(e) { error(e); }
  finally { posting = false; await refresh(); }
}
function supervisionHistory(w) {
  const s = supervisionView;
  if (w.key !== "h2_v6_supervised" || !s?.initialized) return "";
  const last = s.timeline.filter(t => t.difference != null).at(-1), k = w.supervision || {};
  return `<article class="card"><div class="card-head"><h2>Supervisão humana · histórico</h2><small class="muted">Início ${day(s.inception)} · criada em ${stamp(s.initialized_at)}</small></div>
    ${facts([["Aguardando aprovação",num(k.awaiting)],["Aprovadas",num(k.approved)],["Rejeitadas",num(k.rejected)],["Não executadas por limite ou bloqueio",num(k.not_executed)],["Execuções virtuais",num(k.executed)],["Diferença atual vs H2 original",last ? `${signed(last.difference, money)} em ${day(last.session)}` : ND]],"wide")}
    <h3>Decisões supervisionadas</h3>${table(["Sessão","Recomendação","Ação humana","Limites","Estado","Motivo"], s.proposals.slice().reverse().map(p => [day(p.decision_session),signal(p.direction || null),p.approval ? (p.approval.action === "APPROVE" ? "Aprovou" : "Rejeitou") + (p.cancel ? " · cancelou" : "") : "—",p.approval && Object.keys(p.approval.limits || {}).length ? Object.entries(p.approval.limits).map(([k,v]) => chip(limitText(k, v))).join(" ") : "—",stateChip(p.order_state),`<span class="wrap">${esc((p.outcome || {}).reason || p.reason)}</span>`]))}
    <h3>Linha do tempo: intervenção × patrimônio</h3>${table(["Fechamento","H2 original","Supervisionada","Diferença","Proposta da sessão"], s.timeline.slice().reverse().map(t => [day(t.session),money(t.original_equity),money(t.supervised_equity),t.difference == null ? ND : `<span class="${tone(t.difference)}">${signed(t.difference, money)}</span>`,t.order_state ? stateChip(t.order_state) : "—"]))}
    <p class="muted small">Diferença descritiva entre duas carteiras paralelas com mesmo início, capital, custos e preços observados. Com poucas sessões e julgamento humano não cego, ela não demonstra efeito causal da supervisão.</p></article>`;
}
function renderHistory() {
  $("history").innerHTML = records.length ? table(["Sessão","Estado","COMPRA / VENDA / MANTER","Sinal técnico","Decisão final","Alvo",""], records.slice().reverse().map(r=>[day(r.session),chip(r.status),r.vote_counts ? `${r.vote_counts.COMPRA ?? 0} / ${r.vote_counts.VENDA ?? 0} / ${r.vote_counts.MANTER ?? 0}` : ND,signal(r.technical_outcome),signal(r.final_decision),pct(r.target_weight),r.has_decision ? `<button data-session="${esc(r.session)}">Abrir</button>` : ""])) : empty("Nenhuma deliberação registrada");
}
async function loadDecision(session="") {
  scenarioController?.abort(); clearTimeout(scenarioTimer);
  const version = ++decisionVersion;
  const query = session ? `?session=${encodeURIComponent(session)}` : "";
  try {
    const [d, s] = await Promise.all([api(`decision${query}`), api(`supervision${query}`)]);
    if (version === decisionVersion) { supervisionView = s; renderDecision(d); renderComposition(); }
  } catch(e) { if (version === decisionVersion) error(e); }
}

/* ── Carteiras ─────────────────────────────────────────────── */
function allocation(w) {
  const [stock, cash] = w.composition;
  return `<div class="allocation" role="img" aria-label="PETR4 ${pct(stock.weight)}, caixa ${pct(cash.weight)}">${stock.weight > 0 ? `<span class="seg stock" style="width:${stock.weight * 100}%"></span>` : ""}${cash.weight > 0 ? `<span class="seg cash" style="width:${cash.weight * 100}%"></span>` : ""}</div>
    <ul class="legend"><li><i class="key stock"></i>PETR4 <strong>${pct(stock.weight)}</strong> · ${money(stock.value)} · ${num(stock.units)} unidades</li><li><i class="key cash"></i>Caixa <strong>${pct(cash.weight)}</strong> · ${money(cash.value)}</li></ul>`;
}
function renderComposition() {
  const w = wallets.find(w => w.key === $("strategy").value);
  document.querySelectorAll("[data-wallet]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.wallet === w?.key)));
  if (!w) { $("composition").innerHTML = ""; $("trades").innerHTML = ""; return; }
  if (!w.available) { $("composition").innerHTML = `<article class="card">${empty(`${w.label}: sem carteira prospectiva`, esc(w.reason))}</article>`; $("trades").innerHTML = ""; return; }
  $("composition").innerHTML = `<article class="card" style="--series:${COLORS[w.key]}"><div class="card-head"><h2><span class="swatch" aria-hidden="true"></span>${esc(w.label)} · composição atual</h2><small class="muted">Marcação ${day(w.mark?.session)} · ${money(w.mark?.close)} por unidade ajustada</small></div>
    <div class="value">${money(w.equity)} <small class="delta ${tone(w.return)}">${signed(w.return, pct)} · ${signed(w.pnl, money)}</small></div>
    <h3>Posição executada</h3>${allocation(w)}
    ${w.pending ? `<h3>Intenção pendente</h3><div class="allocation target" role="img" aria-label="Alvo ${pct(w.pending.target_weight)} PETR4, não executado"><span class="seg ghost" style="width:${w.pending.target_weight * 100}%"></span></div><p class="muted small">Alvo ${pct(w.pending.target_weight)} PETR4 na abertura de ${day(w.pending.target_session)}. Uma intenção de compra não é posição: a composição só muda após a execução observada.</p>` : ""}
    ${facts([["Patrimônio total",money(w.equity)],["Capital inicial",money(w.initial_capital)],["Exposição",pct(w.exposure)],["Custos acumulados",money(w.costs)],["Operações executadas",num(w.trades.length)],["Drawdown máximo",w.max_drawdown == null ? `${ND} · requer 2+ fechamentos` : pct(w.max_drawdown)],["Ordem pendente",w.pending ? `${day(w.pending.target_session)} · alvo ${pct(w.pending.target_weight)}` : "Nenhuma"],["Última decisão",w.last_decision ? `${day(w.last_decision.session)} · ${esc(STATES[w.last_decision.status]?.[0] || w.last_decision.status)} · alvo ${pct(w.last_decision.target_weight)}` : w.key === "buy_and_hold" ? "Compra única na primeira abertura após a inicialização" : "Sem decisão"],["Proventos","Ainda não contabilizados"]],"wide")}</article>`;
  $("trades").innerHTML = supervisionHistory(w) + `<article class="card"><h2>Operações executadas · ${esc(w.label)}</h2>${w.trades.length ? table(["Decisão","Execução","Ativo","Lado","Preço","Quantidade","Custo","Patrimônio no fechamento"], w.trades.map(t=>[t.decision_session ? day(t.decision_session) : w.key === "buy_and_hold" ? "Regra B&H" : ND,day(t.session),esc(t.asset),signal(t.type === "BUY" ? "COMPRA" : t.type === "SELL" ? "VENDA" : t.type),money(t.price),num(t.quantity),money(t.cost),money(t.equity_after)])) : empty("Nenhuma operação executada", "Ordens pendentes não são patrimônio investido.")}</article>`;
}
function renderWallets(data) {
  wallets = (data?.wallets || []).slice().sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const selected = $("strategy").value;
  $("strategy").innerHTML = wallets.map(w=>`<option value="${esc(w.key)}">${esc(w.label)}</option>`).join("");
  if (wallets.some(w => w.key === selected)) $("strategy").value = selected;
  $("wallet-table").innerHTML = wallets.length ? table(["Estratégia","Patrimônio","Retorno","Resultado","PETR4","Caixa","Exposição","Operações","Pendente","Custos","Atualização"], wallets.map(w => w.available ? [`<button class="link" data-wallet="${esc(w.key)}" style="--series:${COLORS[w.key]}"><span class="swatch" aria-hidden="true"></span>${esc(w.label)}</button>`,money(w.equity),`<span class="${tone(w.return)}">${signed(w.return, pct)}</span>`,`<span class="${tone(w.pnl)}">${signed(w.pnl, money)}</span>`,money(w.marked_value),money(w.cash),pct(w.exposure),num(w.trades.length),w.pending ? `Alvo ${pct(w.pending.target_weight)} · ${day(w.pending.target_session)}` : "—",money(w.costs),`${day(w.mark?.session)}${w.mark?.session < latestMark() ? ' <span class="warn">· sem novos dados</span>' : ""}`] : [esc(w.label),`<span class="warn">Indisponível</span>`,"","","","","","","","",""])) : empty("Nenhuma carteira prospectiva");
  const comparable = wallets.filter(w => w.available && w.comparable !== false);
  $("comparison-note").textContent = `${data?.comparison_note || ""}${comparable.length < wallets.length ? ` Fora do gráfico: ${wallets.filter(w => !comparable.includes(w)).map(w => w.label).join(", ")}.` : ""}`;
  equityChart("wallet-chart", comparable);
  renderComposition();
}

/* ── Agentes ───────────────────────────────────────────────── */
// ponytail: mirrors the ensemble rule in src/agents/technical_analyst.py (ties favour MANTER, then COMPRA).
function quorum(n, threshold, votes, requireAll) {
  const total = votes.COMPRA + votes.VENDA + votes.MANTER;
  if (Object.values(votes).some(v => !Number.isInteger(v) || v < 0) || total > n) return {error:`Informe votos inteiros que somem no máximo ${n}.`};
  const missing = n - total;
  if (requireAll && missing) return {reached:false, winner:null, share:null, text:`Quórum incompleto: ${missing} resposta(s) ausente(s) ou inválida(s). Sem consenso; o sinal seguro é MANTER.`};
  let winner = "MANTER";
  for (const s of ["COMPRA","VENDA"]) if (votes[s] > votes[winner]) winner = s;
  const den = requireAll ? n : total, share = den ? votes[winner] / den : 0, reached = share >= threshold;
  return {reached, winner:reached ? winner : null, share, text:reached ? `Consenso em ${winner}: ${votes[winner]}/${den} = ${pct(share)} ≥ ${pct(threshold)}.` : `Sem consenso: ${votes[winner]}/${den} = ${pct(share)} no sinal mais votado, abaixo de ${pct(threshold)}. O sinal seguro é MANTER.`};
}
function simulate() {
  const n = Number($("sim-n").value), votes = {COMPRA:Number($("sim-compra").value), VENDA:Number($("sim-venda").value), MANTER:Number($("sim-manter").value)};
  const r = quorum(n, Number($("sim-threshold").value), votes, $("sim-all").checked);
  $("sim-out").innerHTML = r.error ? `<span class="warn">${esc(r.error)}</span>` : `${signal(r.reached ? r.winner : "SEM CONSENSO")} ${esc(r.text)}`;
}
function agentTile(a) {
  const short = a.id.startsWith("TA") ? ["TA", Number(a.id.slice(3))] : [a.id, ""];
  if (!a.active) return `<div class="agent-tile idle"><span class="avatar" aria-hidden="true">${short[0]}<b>${short[1]}</b></span><div><strong>${esc(a.id)}</strong><small>Slot livre · sem histórico</small></div></div>`;
  const last = a.observations?.history?.at(-1);
  return `<button class="agent-tile" data-agent="${esc(a.id)}" aria-pressed="${a.id === selectedAgent}"><span class="avatar" aria-hidden="true">${short[0]}<b>${short[1]}</b></span><div><strong>${esc(a.id)}</strong><small>${esc(a.role)} · ativo na H2 v6</small>${last?.output ? signal(last.output) : ""}</div></button>`;
}
function renderProfile() {
  const a = agentsData?.agents.find(a => a.id === selectedAgent);
  if (!a) { $("profile").innerHTML = ""; return; }
  const o = a.observations, rate = (v) => v == null ? ND : pct(v, 1);
  $("profile").innerHTML = `<article class="card profile"><div class="card-head"><div class="who"><span class="avatar" aria-hidden="true">${a.id.startsWith("TA") ? `TA<b>${Number(a.id.slice(3))}</b>` : esc(a.id)}</span><div><h2>${esc(a.id)} · ${esc(a.role)}</h2><small class="muted">Ficha com dados registrados; métricas descritivas não medem competência individual.</small></div></div>${chip(a.active ? "Ativo · H2 v6" : "Slot livre")}</div>
    <div class="pair">${facts([["Modelo",a.params ? `${esc(a.params.provider)} · ${esc(a.params.model)}` : ND],["Versão do prompt",esc(a.prompt_version)],["Parâmetros",a.params ? Object.entries(a.params).filter(([k]) => !["provider","model"].includes(k)).map(([k,v])=>chip(`${k}=${v}`)).join(" ") : ND],["Seed observada",esc(o?.history.at(-1)?.seed)]])}
    ${o ? facts([["Chamadas registradas",num(o.calls)],["Sessões",num(o.sessions)],["Decisões registradas",num(o.decisions)],["Distribuição",Object.entries(o.outputs).map(([k,v])=>`${signal(k)} ${v}`).join(" ") || ND],["Confiança média",num(o.mean_confidence, 4)],["Concordância com o consenso",o.agreement == null ? ND : `${rate(o.agreement)} em ${o.agreement_n} sessão(ões) com consenso`],["Taxa de erro",rate(o.error_rate)],["Retries",`${o.retries} · ${rate(o.retry_rate)} das chamadas`],["Tokens",o.tokens == null ? `${ND} · não registrados pelo provedor` : `${num(o.tokens, 0)} · cobertura ${rate(o.token_coverage)}`],["Custo estimado",o.cost_usd == null ? ND : `US$ ${num(o.cost_usd, 5)} · preço de tabela do runner`]]) : empty("Sem observações", a.active ? "Nenhuma chamada registrada." : "Este slot não participou da H2 v6 nem de experimentos registrados.")}</div>
    ${o ? `<h3>Histórico de chamadas</h3>${table(["Sessão","Estado","Saída","Confiança","Tentativas","Tokens","Duração","Custo est. (US$)"], o.history.map(h=>[day(h.session),esc(h.status),signal(h.output),num(h.confidence, 2),num(h.attempt_count),num(h.tokens, 0),h.duration_ms == null ? ND : `${num(h.duration_ms / 1000, 1)} s`,num(h.cost_usd, 5)]))}` : ""}</article>`;
}
function renderAgents() {
  if (!agentsData) { $("committee").innerHTML = empty("Configuração indisponível"); $("catalog").innerHTML = ""; renderProfile(); return; }
  const c = agentsData.configuration, list = agentsData.agents, ta = list.filter(a => a.role === "Technical Analyst");
  $("committee").innerHTML = `<article class="card"><div class="card-head"><h2>Comitê ${esc(c.name)}</h2>${chip("Congelada · não editável","sig-warn")}</div>
    ${facts([["Analistas ativos",`${c.analyst_count} de ${ta.length} slots técnicos`],["Limiar de consenso",pct(c.consensus_threshold)],["Todas as respostas exigidas",c.require_all_votes ? "Sim" : "Não"],["Modelo",`${esc(c.provider)} · ${esc(c.model)} · T=${num(c.temperature)} · thinking ${esc(c.thinking_level)}`],["Posições no catálogo",`${c.slots} = ${ta.length} Technical + Risk + Portfolio`]])}
    <p class="muted small">Tamanhos planejados para experimentos futuros: 5 · 10 · 15 · 20 · 30 analistas. Cada configuração diferente exigirá identidade experimental e ledger próprios, em fase futura; a H2 v6 permanece com ${c.analyst_count}.</p></article>`;
  $("catalog").innerHTML = `<article class="card"><div class="card-head"><h2>Technical Analysts · ${ta.length} slots</h2><small class="muted">${ta.filter(a => a.active).length} ativos na configuração observada · ${ta.filter(a => !a.active).length} livres, sem histórico</small></div><div class="agent-grid">${ta.map(agentTile).join("")}</div>
    <h2>Gestão</h2><div class="agent-grid">${list.filter(a => a.role !== "Technical Analyst").map(agentTile).join("")}</div></article>`;
  renderProfile();
}

/* ── Carga ─────────────────────────────────────────────────── */
async function refresh() {
  const version = ++refreshVersion;
  $("error").hidden = true;
  try {
    const [history, data, agents, last] = await Promise.all([api("history"), api("portfolios"), api("agents"), api("decision")]);
    if (version !== refreshVersion) return;
    records = history || []; latest = last; agentsData = agents;
    const selected = $("session").value;
    $("session").innerHTML = records.map(r=>`<option value="${esc(r.session)}">${day(r.session)} · ${esc(r.status)}</option>`).reverse().join("");
    if (records.some(r => r.session === selected)) $("session").value = selected;
    else if (records.some(r => r.has_decision)) $("session").value = records.filter(r => r.has_decision).at(-1).session;
    renderWallets(data); renderOverview(); renderHistory(); renderAgents();
    await loadDecision($("session").value);
  } catch(e) { error(e); }
}
$("session").addEventListener("change", () => loadDecision($("session").value));
$("strategy").addEventListener("change", renderComposition);
$("refresh").addEventListener("click", refresh);
$("error").addEventListener("click", (e) => { if (e.target.id === "retry") refresh(); });
$("history").addEventListener("click", (e) => { const s = e.target.dataset?.session; if (s) { $("session").value = s; loadDecision(s); } });
$("wallet-table").addEventListener("click", (e) => { const k = e.target.closest?.("[data-wallet]")?.dataset.wallet; if (k) { $("strategy").value = k; renderComposition(); } });
$("overview-series").addEventListener("change", (e) => { const k = e.target.dataset?.series; if (k) { e.target.checked ? visible.add(k) : visible.delete(k); renderOverviewChart(); } });
$("catalog").addEventListener("click", (e) => { const id = e.target.closest?.("[data-agent]")?.dataset.agent; if (id) { selectedAgent = id; renderAgents(); } });
$("sim-form").addEventListener("input", simulate);
$("sim-form").addEventListener("submit", (e) => e.preventDefault());
$("decision").addEventListener("click", (e) => {
  const action = e.target.dataset?.action;
  if (action) askSupervision(action);
  if (e.target.id === "simulate-opening") {
    clearTimeout(scenarioTimer);
    const input = $("hypothetical-open"), value = Number(input.value);
    if (!input.value || !Number.isFinite(value) || value <= 0 || value > 1000000) {
      $("scenario-result").innerHTML = '<p class="bad">Informe um preço hipotético positivo, até R$ 1.000.000.</p>'; return;
    }
    evaluateScenario(value);
  }
});
$("decision").addEventListener("submit", e => e.preventDefault());
$("market-refresh").addEventListener("click", loadMarket);
$("decision").addEventListener("input", (e) => { if (e.target.dataset?.limit) preview(); if (e.target.id === "hypothetical-open") { clearTimeout(scenarioTimer); scenarioController?.abort(); $("scenario-result").innerHTML = ""; } });
$("sup-accept").addEventListener("change", () => $("sup-submit").disabled = !$("sup-accept").checked);
$("sup-dismiss").addEventListener("click", () => { pendingAction = null; $("sup-dialog").close(); });
$("sup-submit").addEventListener("click", confirmSupervision);
if (typeof window !== "undefined") window.addEventListener("hashchange", route);
route(); simulate(); refresh();

let csrf, busy=false, posting=false, report=null, completedJob=null, confirmationToken=null;
const checkLabels={treatment_identity:"Identidade H2 v6 e Git limpo",after_reserved_windows:"Fora das janelas reservadas",before_target_open:"Antes da abertura-alvo",not_yet_decided:"Decisão ainda não existe",no_active_lock:"Ledger sem lock ativo",gemini_api_key_present:"Chave configurada no backend",input_frozen:"Input congelado e íntegro",ledger_reconciles:"Carteira reconciliável"};
function controls() {
  ["prepare","preflight","benchmarks","supervised-sync"].forEach(id=>$(id).disabled=busy||posting||!csrf);
  $("execute").disabled=busy||posting||!report?.ready||!report?.confirmation_token;
}
function renderReport() {
  if(!report) { $("preflight-report").innerHTML=""; return; }
  const c=report.calendar||{}, input=report.input||{}, m=report.model||{}, estimate=report.estimate||{};
  $("preflight-report").innerHTML=`<hr/><h3>Preflight ${chip(report.state)}</h3>${facts([["Referência → data-alvo",`${esc(c.decision_session)} → ${esc(c.target_session)}`],["Prazo",esc(c.target_open_deadline)],["Input SHA256",esc(input.sha256?.slice(0,12))],["Modelo registrado",`${esc(m.model)} · T=${num(m.temperature)} · thinking ${esc(m.thinking_level)} · ${report.identity_verified?"identidade verificada":"identidade ainda não verificada"}`],["Custo estimado (USD)",`${num(estimate.usd_expected)} esperado · ${num(estimate.usd_prudent_budget)} orçamento prudente · ${num(estimate.usd_theoretical_ceiling)} teto teórico`]])}<p class="muted">Estimativa registrada pelo runner, não cotação em tempo real. ${esc(estimate.price_note)}</p><details><summary>Verificações do backend</summary>${Object.entries(report.checks||{}).map(([key,ok])=>`<p class="${ok?"good":"bad"}">${ok?"✓":"×"} ${esc(checkLabels[key]||key)}</p>`).join("")}</details>${report.state==="DECISION_EXISTS"?'<p class="callout">Decisão já existente: somente consulta, sem nova chamada Gemini.</p>':report.state==="RECOVERY_REQUIRED"?'<p class="callout bad">Tentativa/journal anterior encontrado. Recuperação só por diagnóstico e replay offline; chamadas pagas bloqueadas.</p>':!report.ready?'<p class="muted">Execução bloqueada. Corrija os gates indicados e repita o preflight. Não remova registros ou locks sem diagnóstico local.</p>':'<p class="good">READY · confirmação válida por até 10 minutos e vinculada ao input e ao ledger.</p>'}`;
}
async function submit(command,payload={}) {
  if(posting||busy) return;
  posting=true; controls(); $("error").hidden=true;
  try {
    const job=await api(command,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(payload)});
    report=null; renderReport(); busy=true;
    $("job").textContent=`${job.command}: solicitado · ${job.session}. Acompanhe abaixo.`;
  } catch(e) { error(e); report=null; renderReport(); }
  finally { posting=false; controls(); await pollStatus(false); }
}
async function pollStatus(schedule=true) {
  try {
    const state=await api("status"); csrf=state.csrf_token; busy=state.busy;
    const j=state.job;
    if(j) {
      const progress=j.progress;
      $("job").innerHTML=`<p>${chip(j.command)} ${chip(j.state==="RUNNING" && j.command==="run"?"EXECUTANDO":j.state)} · ${esc(j.session)}</p><p>${esc(j.stage)}${j.error?` · <span class="bad">${esc(j.error)}</span>`:""}</p>${progress?`<p class="muted">Progresso observado no journal: ${progress.unavailable?esc(progress.message):`${progress.recorded} respostas gravadas / ${progress.reserved} chamadas reservadas. Total final depende dos gates do tratamento.`}</p>${(progress.stages||[]).map(s=>chip(`#${s.sequence} ${s.stage||"reservada / em andamento"} · ${s.status||"sem resposta gravada"}`)).join(" ")}`:""}${j.recovery_note?`<details><summary>Interrupção e recuperação</summary><p>${esc(j.recovery_note)}</p></details>`:""}${j.benchmarks?Object.entries(j.benchmarks).map(([k,v])=>`<p class="muted">${esc(k)}: ${esc(v)}</p>`).join(""):""}${j.supervised?`<p class="muted">Carteira supervisionada: ${esc(j.supervised)}</p>`:""}`;
      if(j.command==="preflight" && j.state==="COMPLETE") { report=j.report; renderReport(); }
      if(j.state!=="RUNNING" && completedJob!==j.id) { completedJob=j.id; await refresh(); }
    } else if(busy) $("job").textContent="Bloqueio persistente sem job disponível: recuperação local necessária. Nenhuma inferência será repetida.";
    controls();
  } catch(e) { error(e); csrf=null; controls(); }
  if(schedule) setTimeout(()=>pollStatus(),2000);
}
$("prepare").addEventListener("click",()=>submit("prepare"));
$("preflight").addEventListener("click",()=>submit("preflight"));
$("benchmarks").addEventListener("click",()=>submit("benchmarks"));
$("supervised-sync").addEventListener("click",()=>submit("supervision/sync"));
$("execute").addEventListener("click",()=>{
  if(!report?.ready||busy||posting) return;
  confirmationToken=report.confirmation_token;
  $("confirm-details").innerHTML=facts([["Data-alvo",esc(report.calendar.target_session)],["Input SHA256",esc(report.input.sha256.slice(0,12))],["Modelo",esc(report.model.model)],["USD esperado / prudente",`${num(report.estimate.usd_expected)} / ${num(report.estimate.usd_prudent_budget)}`]]);
  $("accept-charges").checked=false; $("submit-confirm").disabled=true;
  $("confirm-dialog").showModal();
});
$("accept-charges").addEventListener("change",()=>$("submit-confirm").disabled=!$("accept-charges").checked);
$("cancel-confirm").addEventListener("click",()=>$("confirm-dialog").close());
$("submit-confirm").addEventListener("click",()=>{
  if(!$("accept-charges").checked||posting||busy||!confirmationToken) return;
  $("confirm-dialog").close();
  const token=confirmationToken; confirmationToken=null;
  submit("run",{confirm:true,confirmation_token:token});
});
controls(); pollStatus();
