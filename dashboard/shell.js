'use strict';
// Shared shell (V7.6.2): one global navigation rendered by the server from AREAS; this
// script only marks the current area/section from path + hash, keeps the breadcrumb and
// environment strip in sync, carries ?run= between Radar and Carteira, and drives the
// responsive menu. It never fetches data and never triggers an action.
(() => {
  const shell = document.querySelector('.hfl-shell');
  if (!shell) return;
  const menu = shell.querySelector('.hfl-menu'), links = shell.querySelector('.hfl-links');
  const primary = [...shell.querySelectorAll('.hfl-primary a')], secondary = [...shell.querySelectorAll('.hfl-secondary a')];
  const ALIASES = { '/index.html': '/legacy', '/platform.html': '/', '/legacy/': '/legacy' };
  const norm = (p) => { p = ALIASES[p] || p.replace(/\.html$/, '').replace(/\/$/, ''); return p || '/'; };
  //: Pages that understand ?run=<radar run id>; the parameter is carried between them.
  const RUN_PAGES = new Set(['/radar', '/portfolio']);
  //: Hashes a page resolves to another view (mirrors paper.js VIEWS/LEGACY; '' = default view).
  const HASH_ALIASES = { '/paper': { '': '#visao', '#supervisao': '#sala', '#room': '#sala', '#wallets': '#carteiras' } };

  function setMenu(open) {
    menu.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  shell.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
  });

  function carryRun() {
    const run = new URLSearchParams(location.search).get('run');
    [...primary, ...secondary].forEach((a) => {
      const url = new URL(a.getAttribute('href'), location.origin);
      if (!RUN_PAGES.has(norm(url.pathname))) return;
      if (run) url.searchParams.set('run', run); else url.searchParams.delete('run');
      a.href = url.pathname + url.search + url.hash;
    });
  }

  function active() {
    const path = norm(location.pathname), hash = (HASH_ALIASES[path] || {})[location.hash] ?? location.hash;
    const target = (a) => { const u = new URL(a.href, location.origin); return [norm(u.pathname), u.hash]; };
    const fallback = shell.dataset.defaultArea;
    // Exact section (path + hash), then a section of the same page without hash, then the
    // first section of this page inside the server's default area, then the area itself.
    let section = secondary.find((a) => { const [p, h] = target(a); return p === path && h === hash; })
      || secondary.find((a) => { const [p, h] = target(a); return p === path && !h && !hash; })
      || (hash ? null : secondary.find((a) => a.dataset.area === fallback && target(a)[0] === path));
    let area = section?.dataset.area
      || primary.find((a) => { const [p, h] = target(a); return p === path && h === hash; })?.dataset.area
      || fallback;
    if (!section && hash) section = secondary.find((a) => a.dataset.area === area && target(a)[0] === path) || null;
    const areaLink = primary.find((a) => a.dataset.area === area);
    primary.forEach((a) => (a === areaLink ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    secondary.forEach((a) => {
      a.hidden = a.dataset.area !== area;
      a === section ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    shell.querySelector('.hfl-secondary').hidden = secondary.filter((a) => !a.hidden).length < 2;
    const crumbArea = shell.querySelector('[data-crumb=area]'), crumbPage = shell.querySelector('[data-crumb=page]');
    if (areaLink) {
      crumbArea.innerHTML = '';
      const link = document.createElement('a');
      link.href = areaLink.href;
      link.textContent = areaLink.textContent;
      crumbArea.appendChild(link);
      shell.querySelector('.hfl-env').textContent = areaLink.dataset.env || '';
    }
    crumbPage.hidden = !section;
    crumbPage.textContent = section ? section.textContent : '';
  }
  carryRun();
  active();
  window.addEventListener('hashchange', active);
  window.addEventListener('popstate', () => { carryRun(); active(); });

  // Scrollable tables become focusable, labelled regions (keyboard and screen readers).
  function tables(root) {
    const list = [...(root.matches?.('.scroll,.table-scroll,.table-container,.ds-table-wrap') ? [root] : []), ...root.querySelectorAll('.scroll,.table-scroll,.table-container,.ds-table-wrap')];
    list.forEach((e) => {
      e.tabIndex = 0;
      if (!e.hasAttribute('role')) e.setAttribute('role', 'region');
      if (!e.hasAttribute('aria-label')) e.setAttribute('aria-label', e.closest('.card,article,section')?.querySelector('h2,h3')?.textContent || 'Tabela rolável');
    });
  }
  tables(document);
  new MutationObserver((changes) => changes.forEach((c) => c.addedNodes.forEach((n) => { if (n.nodeType === 1) tables(n); }))).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
})();
