'use strict';
// Shared UI behaviour (V7.6.2): contextual help, help center, state badges, copy buttons.
// Pages write markup only:
//   <button class="ds-help" data-help="rsi"></button>   contextual help ("?") from glossary.js
//   <span data-ds-state="VALID_PROPOSAL"></span>         semantic state badge
//   <button class="ds-copy" data-copy="<text>"></button> copy an identifier or hash
// Content added later by page scripts is enhanced too (MutationObserver).
(() => {
  const G = window.HFL_GLOSSARY || {};
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // icon, Portuguese label, tone, glossary id. Original codes stay visible in <code>.
  const STATES = {
    PREPARED: ['◐', 'Preparado', 'info', 'snapshot'],
    BLOCKED: ['⊘', 'Bloqueado', 'warn', null],
    RUNNING: ['⟳', 'Em execução', 'info', null],
    COMPLETED: ['●', 'Concluído', 'neutral', null],
    VALID_PROPOSAL: ['✓', 'Proposta validada', 'ok', 'proposta-validada'],
    REJECTED_BY_VALIDATOR: ['✕', 'Rejeitada pelo validador', 'error', 'proposta-rejeitada'],
    EXPIRED: ['⌛', 'Validade expirada', 'neutral', null],
    READ_ONLY: ['▣', 'Somente leitura', 'neutral', null],
    SYNTHETIC: ['≈', 'Demonstração sintética', 'synthetic', 'demonstracao-sintetica'],
    SYNTHETIC_DEMO: ['≈', 'Demonstração sintética', 'synthetic', 'demonstracao-sintetica'],
    OFFICIAL: ['◆', 'Oficial', 'info', 'oficial'],
    CONSULTATIVE_SANDBOX: ['ⓘ', 'Consultivo · sem ordens', 'neutral', 'consultivo'],
    CLOSED: ['⊝', 'Tratamento encerrado', 'neutral', 'tratamento-encerrado'],
    INCIDENT_PRESERVED: ['⚠', 'Incidente preservado', 'warn', null],
    RECOVERY_REQUIRED: ['⚠', 'Recuperação necessária', 'warn', 'replay'],
    FAILED: ['✕', 'Falhou', 'error', null],
    UNAVAILABLE: ['–', 'Indisponível', 'neutral', null],
  };

  function state(code, { label, showCode = true } = {}) {
    const [icon, text, tone] = STATES[code] || ['•', code, 'neutral'];
    return `<span class="ds-state" data-state="${esc(code)}" data-tone="${tone}"><span class="ds-state-icon" aria-hidden="true">${icon}</span><span>${esc(label || text)}</span>${showCode && STATES[code] ? `<code>${esc(code)}</code>` : ''}</span>`;
  }
  const help = (id) => `<button type="button" class="ds-help" data-help="${esc(id)}"></button>`;

  // --- Contextual help popover (non-modal, stays open until closed) -------------------
  let pop = null, owner = null;
  function popover() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'ds-popover';
    pop.id = 'ds-help-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    pop.setAttribute('aria-labelledby', 'ds-help-title');
    pop.tabIndex = -1;
    pop.hidden = true;
    document.body.appendChild(pop);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } });
    pop.addEventListener('click', (e) => {
      if (e.target.closest('.ds-popover-close')) close(true);
      const link = e.target.closest('[data-glossary-open]');
      if (link) { e.preventDefault(); const id = link.dataset.glossaryOpen; close(false); center(id); }
    });
    return pop;
  }
  function content(id) {
    const t = G[id];
    if (!t) return `<h2 id="ds-help-title">Termo indisponível</h2><p>Sem definição para “${esc(id)}”.</p>`;
    return `<button type="button" class="ds-popover-close" aria-label="Fechar ajuda">×</button>
      <h2 id="ds-help-title">${esc(t.term)}</h2>
      <p>${esc(t.short)}</p>
      ${t.long || t.example ? `<details><summary>Saiba mais</summary>${t.long ? `<p>${esc(t.long)}</p>` : ''}${t.example ? `<p><strong>Exemplo:</strong> ${esc(t.example)}</p>` : ''}</details>` : ''}
      ${t.caution ? `<p class="ds-help-caution"><strong>Cuidado:</strong> ${esc(t.caution)}</p>` : ''}
      ${t.ref ? `<p class="ds-help-ref">Definição no laboratório: <code>${esc(t.ref)}</code></p>` : ''}
      <p><a href="#glossario-${esc(id)}" data-glossary-open="${esc(id)}">Ver no glossário completo →</a></p>`;
  }
  function place(button) {
    const p = popover(), r = button.getBoundingClientRect(), gap = 8, margin = 12;
    p.style.left = '0px'; p.style.top = '0px';
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = Math.min(Math.max(margin, r.left + r.width / 2 - w / 2), window.innerWidth - w - margin);
    let top = r.bottom + gap;
    if (top + h > window.innerHeight - margin && r.top - gap - h > margin) top = r.top - gap - h;
    p.style.left = Math.max(margin, left) + window.scrollX + 'px';
    p.style.top = top + window.scrollY + 'px';
  }
  function open(button) {
    const p = popover();
    if (owner && owner !== button) close(false);
    owner = button;
    p.innerHTML = content(button.dataset.help);
    p.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', p.id);
    place(button);
    p.focus({ preventScroll: true });
  }
  function close(returnFocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (owner) {
      owner.setAttribute('aria-expanded', 'false');
      if (returnFocus) owner.focus({ preventScroll: true });
    }
    owner = null;
  }
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.ds-help');
    if (button) { e.preventDefault(); owner === button ? close(true) : open(button); return; }
    if (pop && !pop.hidden && !pop.contains(e.target)) close(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop && !pop.hidden) close(true); });
  window.addEventListener('resize', () => owner && place(owner));

  // --- Help center: the whole glossary, searchable ------------------------------------
  let dialog = null;
  function center(focusId) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'ds-dialog';
      dialog.id = 'hfl-help-center';
      dialog.setAttribute('aria-labelledby', 'hfl-help-center-title');
      const entries = Object.entries(G).sort((a, b) => a[1].term.localeCompare(b[1].term, 'pt-BR'));
      dialog.innerHTML = `<div class="ds-dialog-head"><h2 id="hfl-help-center-title">Ajuda e glossário</h2><button type="button" class="ds-popover-close" data-close aria-label="Fechar ajuda">×</button></div>
        <div class="ds-dialog-body"><p class="ds-lead">O Hedge-Fund-Lab é um laboratório de pesquisa: nenhuma ordem real é enviada. Ações que podem gerar custo de API aparecem com o símbolo ¤ e sempre pedem confirmação.</p>
        <label>Buscar termo <input type="search" id="hfl-help-search" autocomplete="off"></label>
        <div class="ds-glossary" id="hfl-help-list">${entries.map(([id, t]) => `<article id="glossario-${esc(id)}" data-term="${esc((t.term + ' ' + t.short).toLowerCase())}"><h3>${esc(t.term)}</h3><p>${esc(t.short)}</p>${t.caution ? `<p class="ds-help-caution"><strong>Cuidado:</strong> ${esc(t.caution)}</p>` : ''}</article>`).join('')}</div></div>`;
      document.body.appendChild(dialog);
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.querySelector('#hfl-help-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        dialog.querySelectorAll('#hfl-help-list article').forEach((a) => { a.hidden = q && !a.dataset.term.includes(q); });
      });
    }
    if (!dialog.open) dialog.showModal();
    const target = focusId && dialog.querySelector('#glossario-' + CSS.escape(focusId));
    if (target) { target.tabIndex = -1; target.scrollIntoView({ block: 'start' }); target.focus(); }
    else dialog.querySelector('#hfl-help-search').focus();
  }

  // --- Enhancement ----------------------------------------------------------------------
  function enhance(root) {
    const scope = root.querySelectorAll ? root : document;
    scope.querySelectorAll('button.ds-help:not([data-ds-ready])').forEach((b) => {
      const t = G[b.dataset.help];
      b.dataset.dsReady = '1';
      b.type = 'button';
      b.textContent = '?';
      b.setAttribute('aria-label', 'Ajuda: ' + (t ? t.term : b.dataset.help));
      b.setAttribute('aria-expanded', 'false');
      if (!t) { b.disabled = true; console.warn('glossary_term_missing', b.dataset.help); }
    });
    scope.querySelectorAll('[data-ds-state]:not([data-ds-ready])').forEach((s) => {
      s.dataset.dsReady = '1';
      s.outerHTML = state(s.dataset.dsState, { label: s.dataset.label, showCode: s.dataset.code !== 'false' });
    });
    scope.querySelectorAll('button.ds-copy:not([data-ds-ready])').forEach((b) => {
      b.dataset.dsReady = '1';
      b.type = 'button';
      b.textContent = 'Copiar';
      b.setAttribute('aria-label', 'Copiar ' + (b.dataset.copyLabel || 'identificador'));
    });
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button.ds-copy');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copiado'; }
    catch { b.textContent = 'Copie manualmente'; }
    setTimeout(() => { b.textContent = 'Copiar'; }, 1600);
  });
  enhance(document);
  new MutationObserver((changes) => changes.forEach((c) => c.addedNodes.forEach((n) => { if (n.nodeType === 1 && n !== pop) enhance(n.parentNode || n); }))).observe(document.body, { childList: true, subtree: true });
  document.getElementById('hfl-help-open')?.addEventListener('click', () => center());

  window.HFL = Object.freeze({ state, help, glossary: G, states: STATES, openHelpCenter: center });
})();
