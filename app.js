'use strict';
/* Planète 2 — Gestion de stock (parfumerie). Données stockées dans le navigateur (localStorage). */
const KEY = 'planete2.v1';
const CATS = ['Eau de parfum', 'Eau de toilette', 'Extrait', 'Brume', 'Huile / Oud', 'Coffret', 'Autre'];
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const dateFr = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2));
const today = () => new Date().toISOString().slice(0, 10);

let db = load(), view = 'dashboard', q = '', fcat = '', ftype = '';

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.products) && Array.isArray(d.moves)) return d; } catch (e) {}
  return { products: [], moves: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Enregistrement impossible : stockage plein ou bloqué'); }
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
const prod = id => db.products.find(p => p.id === id);
const status = p => p.stock <= 0 ? ['out', 'Rupture'] : p.stock <= p.min ? ['low', 'Stock bas'] : ['ok', 'En stock'];
const margin = p => p.cost > 0 ? ((p.price - p.cost) / p.price * 100) : 0;

/* ---------- Rendu ---------- */
const TITLES = { dashboard: 'Tableau de bord', products: 'Produits', moves: 'Mouvements de stock' };
function render() {
  $('#title').textContent = TITLES[view];
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  const a = $('#actions');
  a.innerHTML = view === 'moves'
    ? '<button class="btn" data-a="in">+ Entrée</button> <button class="btn pri" data-a="out">− Sortie</button>'
    : '<button class="btn pri" data-a="new">+ Nouveau produit</button>';
  $('#view').innerHTML = { dashboard: vDash, products: vProducts, moves: vMoves }[view]();
  fx();
}

const PAL = ['#c8963e', '#6b4a9a', '#d4688a', '#2f7d5b', '#4a7fb5', '#9a8fb0'];
const BOTTLE = 'M40 8h40v18h-6v10c20 8 32 22 32 44v70a14 14 0 0 1-14 14H28a14 14 0 0 1-14-14V80c0-22 12-36 32-44V26h-6z';
function vDash() {
  const P = db.products;
  if (!P.length) return empty();
  const units = P.reduce((s, p) => s + p.stock, 0);
  const cost = P.reduce((s, p) => s + p.stock * p.cost, 0);
  const sale = P.reduce((s, p) => s + p.stock * p.price, 0);
  const alerts = P.filter(p => p.stock <= p.min).sort((a, b) => a.stock - b.stock);
  const pct = Math.round((P.length - alerts.length) / P.length * 100);
  const last = [...db.moves].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 6);
  const byCat = {}; P.forEach(p => byCat[p.cat] = (byCat[p.cat] || 0) + p.stock * p.cost);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), tot = cats.reduce((s, c) => s + c[1], 0) || 1;
  let acc = 0;
  const segs = cats.map(([c, v], i) => { const s = v / tot * 100; const r = `<circle class="seg" r="15.9155" cx="21" cy="21" fill="none" stroke="${PAL[i % 6]}" stroke-width="5" stroke-dasharray="${s} ${100 - s}" stroke-dashoffset="${-acc}" style="animation-delay:${i * 120}ms"><title>${esc(c)} : ${fcfa(v)}</title></circle>`; acc += s; return r; }).join('');
  const agg = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return { d: d.toISOString().slice(0, 10), in: 0, out: 0 }; });
  db.moves.forEach(m => { const a = agg.find(x => x.d === m.date); if (a) a[m.type] += m.qty; });
  const mx = Math.max(1, ...agg.flatMap(a => [a.in, a.out]));
  const bars = agg.map((a, i) => { const x = i * 28 + 4, hi = a.in / mx * 100, ho = a.out / mx * 100;
    return `<g><title>${dateFr(a.d)} : +${a.in} / −${a.out}</title><rect class="b-bg" x="${x - 3}" y="0" width="25" height="110" rx="6"/><rect class="b-in" x="${x}" y="${110 - hi}" width="10" height="${hi}" rx="3" style="animation-delay:${i * 45}ms"/><rect class="b-out" x="${x + 11}" y="${110 - ho}" width="10" height="${ho}" rx="3" style="animation-delay:${i * 45 + 25}ms"/></g>`; }).join('');
  return `<div class="hero2">
    <svg class="bottle" viewBox="0 0 120 170" aria-label="Niveau global du stock : ${pct} %"><defs><clipPath id="bc"><path d="${BOTTLE}"/></clipPath><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f0c56a"/><stop offset="1" stop-color="#a86f1c"/></linearGradient></defs>
      <g clip-path="url(#bc)"><rect width="120" height="170" fill="#ffffff14"/><rect class="liq" data-pct="${pct}" y="34" width="120" height="126" fill="url(#lg)"/><path class="shine" d="M26 84v60" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/></g>
      <path d="${BOTTLE}" fill="none" stroke="#e6d6f5" stroke-width="2"/><rect x="42" y="0" width="36" height="9" rx="3" fill="#c8963e"/></svg>
    <div class="hero-t"><span>Valeur de vente potentielle</span><b data-count="${sale}" data-fmt="fcfa">${fcfa(sale)}</b>
      <p><strong>${pct} %</strong> des références sont au-dessus de leur seuil d’alerte${alerts.length ? ` · <strong>${alerts.length}</strong> à réapprovisionner` : ''}.</p></div></div>
  <div class="kpis">
    <div class="kpi"><span>Valeur du stock (achat)</span><b data-count="${cost}" data-fmt="fcfa">${fcfa(cost)}</b></div>
    <div class="kpi"><span>Marge potentielle</span><b data-count="${sale - cost}" data-fmt="fcfa">${fcfa(sale - cost)}</b></div>
    <div class="kpi"><span>Unités en stock</span><b data-count="${units}">${units}</b></div>
    <div class="kpi"><span>Références</span><b data-count="${P.length}">${P.length}</b></div></div>
  <div class="grid2">
    <div class="card"><h2>Entrées et sorties · 14 jours</h2><svg class="chart" viewBox="0 0 392 130"><g>${bars}</g>${agg.map((a, i) => i % 3 === 0 ? `<text x="${i * 28 + 14}" y="126" text-anchor="middle">${a.d.slice(8)}/${a.d.slice(5, 7)}</text>` : '').join('')}</svg>
      <p class="legend"><i style="background:var(--ok)"></i>Entrées <i style="background:var(--gold)"></i>Sorties</p></div>
    <div class="card"><h2>Valeur par catégorie</h2><div class="donut-w"><svg class="donut" viewBox="0 0 42 42"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="#eee9f4" stroke-width="5"/><g transform="rotate(-90 21 21)">${segs}</g></svg>
      <ul class="legend-l">${cats.map(([c, v], i) => `<li><i style="background:${PAL[i % 6]}"></i>${esc(c)}<b>${Math.round(v / tot * 100)} %</b></li>`).join('')}</ul></div></div></div>
  <div class="grid2">
    <div class="card"><h2>À réapprovisionner</h2>${alerts.length ? `<table><tbody>${alerts.map(p => `<tr><td>${esc(p.name)}<small>${esc(p.supplier || 'Fournisseur non renseigné')}</small></td><td class="num"><span class="badge ${status(p)[0]}">${p.stock} / seuil ${p.min}</span></td><td class="acts"><button class="btn sm" data-a="in" data-id="${p.id}">Entrée</button></td></tr>`).join('')}</tbody></table>` : '<p class="hint">Tous les produits sont au-dessus de leur seuil.</p>'}</div>
    <div class="card"><h2>Derniers mouvements</h2>${last.length ? movesTable(last) : '<p class="hint">Aucun mouvement enregistré.</p>'}</div></div>`;
}
function fx() {
  const calm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  document.querySelectorAll('[data-count]').forEach(el => {
    const t = +el.dataset.count, f = el.dataset.fmt === 'fcfa' ? fcfa : n => String(Math.round(n));
    if (calm) return;
    const t0 = performance.now();
    (function s(now) { const k = Math.min(1, (now - t0) / 1000); el.textContent = f(t * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(s); })(t0);
  });
  const l = $('.liq');
  if (l) requestAnimationFrame(() => requestAnimationFrame(() => l.style.transform = `translateY(${100 - l.dataset.pct}%)`));
}

function vProducts() {
  if (!db.products.length) return empty();
  const s = q.toLowerCase();
  const list = db.products.filter(p => (!fcat || p.cat === fcat) && (!s || [p.name, p.brand, p.supplier].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return `<div class="bar"><input id="q" type="search" placeholder="Rechercher un parfum, une marque, un fournisseur…" value="${esc(q)}" aria-label="Rechercher">
    <select id="fcat" aria-label="Catégorie"><option value="">Toutes les catégories</option>${CATS.map(c => `<option ${c === fcat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
  <div class="card">${list.length ? `<table><thead><tr><th>Produit</th><th>Fournisseur</th><th class="num">Prix achat</th><th class="num">Prix vente</th><th class="num">Marge</th><th class="num">Stock</th><th></th></tr></thead><tbody>
  ${list.map(p => { const [c, l] = status(p); return `<tr><td><b>${esc(p.name)}</b><small>${esc([p.brand, p.cat, p.size && p.size + ' ml'].filter(Boolean).join(' · '))}</small></td>
    <td>${esc(p.supplier || '—')}</td><td class="num">${fcfa(p.cost)}</td><td class="num">${fcfa(p.price)}</td><td class="num">${margin(p).toFixed(0)} %</td>
    <td class="num"><span class="badge ${c}" title="${l}">${p.stock}</span><div class="lvl ${c}"><i style="width:${Math.min(100, p.stock / Math.max(p.min * 3, 1) * 100)}%"></i></div></td>
    <td><div class="acts"><button class="btn sm" data-a="in" data-id="${p.id}">Entrée</button><button class="btn sm" data-a="out" data-id="${p.id}">Sortie</button><button class="btn sm" data-a="edit" data-id="${p.id}">Modifier</button><button class="btn sm bad" data-a="del" data-id="${p.id}" aria-label="Supprimer ${esc(p.name)}">Supprimer</button></div></td></tr>`; }).join('')}
  </tbody></table>` : '<p class="empty">Aucun produit ne correspond à votre recherche.</p>'}</div>`;
}

function movesTable(list) {
  return `<table><thead><tr><th>Date</th><th>Produit</th><th class="num">Qté</th><th class="num">Prix unitaire</th></tr></thead><tbody>${list.map(m => {
    const p = prod(m.pid); return `<tr><td>${dateFr(m.date)}</td><td>${esc(p ? p.name : 'Produit supprimé')}<small>${esc(m.note || '')}</small></td>
    <td class="num ${m.type === 'in' ? 'in-t' : 'out-t'}">${m.type === 'in' ? '+' : '−'}${m.qty}</td><td class="num">${fcfa(m.unit)}</td></tr>`; }).join('')}</tbody></table>`;
}
function vMoves() {
  const list = db.moves.filter(m => !ftype || m.type === ftype).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  return `<div class="bar"><select id="ftype" aria-label="Type"><option value="">Entrées et sorties</option><option value="in" ${ftype === 'in' ? 'selected' : ''}>Entrées</option><option value="out" ${ftype === 'out' ? 'selected' : ''}>Sorties</option></select></div>
  <div class="card">${list.length ? movesTable(list) : '<p class="empty">Aucun mouvement. Enregistrez une entrée à la réception d’une commande, ou une sortie à chaque vente.</p>'}</div>`;
}
function empty() {
  return `<div class="card empty"><h2>Votre boutique est prête</h2><p>Ajoutez votre premier parfum avec son prix fournisseur et son prix de vente.</p>
  <button class="btn pri" data-a="new">+ Nouveau produit</button><button class="btn" data-a="demo">Charger des exemples</button></div>`;
}

/* ---------- Formulaires ---------- */
const dlg = $('#dlg');
function open(html) { dlg.innerHTML = html; dlg.showModal(); const f = dlg.querySelector('input,select'); f && f.focus(); }
const field = (label, name, val = '', attrs = '') => `<label class="f">${label}<input name="${name}" value="${esc(val)}" ${attrs}></label>`;

function productForm(p = {}) {
  open(`<form method="dialog" id="pf"><h2>${p.id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
  ${field('Nom du parfum', 'name', p.name, 'required maxlength="80"')}
  <div class="row">${field('Marque', 'brand', p.brand, 'maxlength="60"')}<label class="f">Catégorie<select name="cat">${CATS.map(c => `<option ${c === p.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
  <div class="row">${field('Contenance (ml)', 'size', p.size, 'type="number" min="0" step="any"')}${field('Fournisseur', 'supplier', p.supplier, 'maxlength="80"')}</div>
  <div class="row">${field('Prix fournisseur (FCFA)', 'cost', p.cost, 'type="number" min="0" step="any" required')}${field('Prix de vente Planète 2 (FCFA)', 'price', p.price, 'type="number" min="0" step="any" required')}</div>
  <div class="row">${p.id ? '' : field('Stock initial', 'stock', 0, 'type="number" min="0" step="1" required')}${field('Seuil d’alerte', 'min', p.min ?? 3, 'type="number" min="0" step="1" required')}</div>
  <div class="foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn pri" value="ok">Enregistrer</button></div></form>`);
  $('#pf').onsubmit = e => {
    const d = Object.fromEntries(new FormData(e.target));
    const rec = { name: d.name.trim(), brand: d.brand.trim(), cat: d.cat, size: +d.size || 0, supplier: d.supplier.trim(), cost: +d.cost, price: +d.price, min: +d.min };
    if (p.id) Object.assign(p, rec); else db.products.push({ id: uid(), stock: Math.max(0, parseInt(d.stock, 10) || 0), ...rec });
    save(); render(); toast('Produit enregistré');
  };
}

function moveForm(type, pid) {
  if (!db.products.length) return toast('Ajoutez d’abord un produit');
  const isIn = type === 'in', first = prod(pid) || db.products[0];
  open(`<form method="dialog" id="mf"><h2>${isIn ? 'Entrée en stock' : 'Sortie de stock'}</h2>
  <label class="f">Produit<select name="pid">${db.products.map(p => `<option value="${p.id}" ${p.id === first.id ? 'selected' : ''}>${esc(p.name)} (stock : ${p.stock})</option>`).join('')}</select></label>
  <div class="row">${field('Quantité', 'qty', 1, 'type="number" min="1" step="1" required')}${field('Date', 'date', today(), 'type="date" required')}</div>
  ${field(isIn ? 'Prix d’achat unitaire (FCFA)' : 'Prix de vente unitaire (FCFA)', 'unit', isIn ? first.cost : first.price, 'type="number" min="0" step="any" required')}
  ${field('Note (n° de facture, client, motif…)', 'note', '', 'maxlength="120"')}
  <p class="hint" id="mh">${isIn ? 'Le prix fournisseur du produit sera mis à jour avec ce prix.' : ''}</p>
  <div class="foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn pri">Enregistrer</button></div></form>`);
  const f = $('#mf');
  f.pid.onchange = () => { const p = prod(f.pid.value); f.unit.value = isIn ? p.cost : p.price; };
  f.onsubmit = e => {
    const d = Object.fromEntries(new FormData(f)), p = prod(d.pid), qty = parseInt(d.qty, 10);
    if (!isIn && qty > p.stock) { e.preventDefault(); $('#mh').textContent = `Stock insuffisant : il reste ${p.stock} unité(s).`; $('#mh').style.color = 'var(--bad)'; return; }
    p.stock += isIn ? qty : -qty;
    if (isIn) p.cost = +d.unit;
    db.moves.push({ id: uid(), ts: Date.now(), pid: p.id, type, qty, unit: +d.unit, date: d.date, note: d.note.trim() });
    save(); render(); toast(isIn ? 'Entrée enregistrée' : 'Sortie enregistrée');
  };
}

function demo() {
  const mk = (name, brand, cat, size, supplier, cost, price, stock, min) => ({ id: uid(), name, brand, cat, size, supplier, cost, price, stock, min });
  db.products.push(mk('Oud Royal', 'Maison Alhambra', 'Eau de parfum', 100, 'Dubai Parfums', 18000, 35000, 12, 4),
    mk('Rose Éclat', 'Lumière', 'Eau de toilette', 50, 'Paris Import', 9000, 18000, 3, 5),
    mk('Ambre Nuit', 'Maison Alhambra', 'Extrait', 30, 'Dubai Parfums', 22000, 45000, 0, 2));
  save(); render();
}

/* ---------- Événements ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return dlg.close();
  const nav = e.target.closest('#nav button'); if (nav) { view = nav.dataset.view; return render(); }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const p = prod(b.dataset.id);
  ({ new: () => productForm(), edit: () => productForm(p), in: () => moveForm('in', b.dataset.id), out: () => moveForm('out', b.dataset.id), demo,
    del: () => { if (confirm(`Supprimer « ${p.name} » et son historique ?`)) { db.products = db.products.filter(x => x !== p); db.moves = db.moves.filter(m => m.pid !== p.id); save(); render(); toast('Produit supprimé'); } } })[b.dataset.a]();
});
document.addEventListener('input', e => { if (e.target.id === 'q') { q = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.id === 'fcat') { fcat = e.target.value; render(); } if (e.target.id === 'ftype') { ftype = e.target.value; render(); } });
$('#export').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `planete2-stock-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
};
$('#import').onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(d.products) || !Array.isArray(d.moves)) throw 0;
    if (confirm('Remplacer toutes les données actuelles par ce fichier ?')) { db = d; save(); render(); toast('Données importées'); }
  } catch (_) { toast('Fichier invalide'); }
  e.target.value = '';
};
render();
