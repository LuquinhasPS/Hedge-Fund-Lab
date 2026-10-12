'use strict';
(() => {
  const shell=document.querySelector('.hfl-shell'),menu=shell?.querySelector('.hfl-menu'),links=shell?.querySelector('.hfl-links');
  if(!shell)return;
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));links.classList.toggle('is-open',open);});
  shell.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.setAttribute('aria-expanded','false');links.classList.remove('is-open');menu.focus();}});
  function active(){const path=location.pathname.replace(/\/$/,'')||'/';let group=path==='/paper'||path==='/paper.html'?(location.hash==='#agentes'?'lab':'operation'):['/radar','/radar.html','/portfolio','/portfolio.html'].includes(path)?'lab':['/h2','/h2.html','/logs','/logs.html','/legacy','/index.html'].includes(path)?'research':'overview';if(['/paper','/paper.html'].includes(path)){shell.querySelector('.hfl-context span').textContent=group==='lab'?'Laboratório / Agentes':'Laboratório / Operação';shell.querySelector('.hfl-context strong').textContent=group==='lab'?'CATÁLOGO H2 v6 · CONFIGURAÇÃO EXISTENTE':'PROSPECTIVO REAL — PAPER';}shell.querySelectorAll('[data-group]').forEach(a=>{if(a.dataset.group===group)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});shell.querySelectorAll('.hfl-secondary a').forEach(a=>{a.hidden=a.dataset.section!==group;const url=new URL(a.href);if(url.pathname===path&&(!url.hash||url.hash===location.hash))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  active();window.addEventListener('hashchange',active);
  function tables(root){
    const list=[...(root.matches?.('.scroll,.table-scroll,.table-container')?[root]:[]),...root.querySelectorAll('.scroll,.table-scroll,.table-container')];
    list.forEach(e=>{e.tabIndex=0;if(!e.hasAttribute('role'))e.setAttribute('role','region');if(!e.hasAttribute('aria-label'))e.setAttribute('aria-label',e.closest('.card,article')?.querySelector('h2,h3')?.textContent||'Tabela rolável');});
  }
  tables(document);
  new MutationObserver(changes=>changes.forEach(c=>c.addedNodes.forEach(n=>{if(n.nodeType===1)tables(n);}))).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
})();
