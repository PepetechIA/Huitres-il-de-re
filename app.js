/* =========================================================
   Mes Huîtres — suivi des achats de douzaines d'huîtres
   Données 100 % locales (localStorage), aucune connexion.
   ========================================================= */
'use strict';

const STORAGE_KEY = 'huitres-ile-de-re.v1';

const DEFAULT_CATEGORIES = [
  'Fine de claire',
  'Spéciale de claire',
  'Pousse en claire',
  'Creuse n°2',
  'Creuse n°3',
  'Creuse n°4',
  'Plate (Belon)',
  'Autre'
];

/* ---------------- Stockage ---------------- */

function blankState() {
  return { entries: [], categories: DEFAULT_CATEGORIES.slice(), lastCategory: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const data = JSON.parse(raw);
    const state = blankState();
    if (Array.isArray(data.entries)) {
      state.entries = data.entries.filter(isValidEntry).map(normalizeEntry);
    }
    if (Array.isArray(data.categories) && data.categories.length) {
      state.categories = data.categories.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim());
    }
    if (typeof data.lastCategory === 'string') state.lastCategory = data.lastCategory;
    return state;
  } catch (err) {
    console.warn('Données illisibles, repartons de zéro.', err);
    return blankState();
  }
}

function isValidEntry(e) {
  return e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
}

function normalizeEntry(e) {
  return {
    id: e.id || makeId(),
    date: e.date,
    category: (typeof e.category === 'string' && e.category.trim()) ? e.category.trim() : 'Autre',
    dozens: clampInt(e.dozens),
    half: clampInt(e.half),
    note: typeof e.note === 'string' ? e.note.slice(0, 80) : ''
  };
}

function clampInt(v) {
  const n = Math.floor(Number(v));
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

function makeId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    toast("Impossible d'enregistrer (stockage plein ?)");
  }
}

let state = loadState();
let editingId = null;
let selectedCategory = null;
let statsPeriod = 'all';

/* ---------------- Helpers ---------------- */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/** Total en douzaines (une demi-douzaine = 0,5) */
const dozensOf = e => e.dozens + e.half * 0.5;
/** Nombre d'huîtres */
const oystersOf = e => e.dozens * 12 + e.half * 6;

function fmtNum(n) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function plural(n, one, many) {
  return Math.abs(n) >= 2 ? many : one;
}

function fmtDozens(n) {
  return fmtNum(n) + ' ' + plural(n, 'douzaine', 'douzaines');
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDateLong(iso) {
  const s = parseISO(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateShort(iso) {
  return parseISO(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

/* ---------------- Navigation ---------------- */

function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'stats') renderStats();
  if (name === 'histo') renderHistory();
}

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

/* ---------------- Formulaire : catégories ---------------- */

function renderCategories() {
  const box = $('#catChips');
  box.innerHTML = '';
  if (!selectedCategory || !state.categories.includes(selectedCategory)) {
    selectedCategory = state.categories.includes(state.lastCategory)
      ? state.lastCategory
      : state.categories[0] || null;
  }
  state.categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (cat === selectedCategory ? ' is-on' : '');
    chip.dataset.cat = cat;
    chip.innerHTML = escapeHtml(cat);

    const removable = !DEFAULT_CATEGORIES.includes(cat);
    if (removable) {
      const x = document.createElement('span');
      x.className = 'chip__x';
      x.textContent = '×';
      x.title = 'Supprimer cette catégorie';
      x.addEventListener('click', ev => {
        ev.stopPropagation();
        removeCategory(cat);
      });
      chip.appendChild(x);
    }

    chip.addEventListener('click', () => {
      selectedCategory = cat;
      renderCategories();
    });
    box.appendChild(chip);
  });
}

function addCategory() {
  const input = $('#fNewCat');
  const name = input.value.trim();
  if (!name) return;
  if (state.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
    toast('Cette catégorie existe déjà');
    selectedCategory = state.categories.find(c => c.toLowerCase() === name.toLowerCase());
  } else {
    state.categories.push(name);
    selectedCategory = name;
    saveState();
    toast('Catégorie ajoutée');
  }
  input.value = '';
  renderCategories();
}

function removeCategory(cat) {
  const used = state.entries.some(e => e.category === cat);
  const msg = used
    ? 'Retirer « ' + cat + ' » de la liste ? Les achats déjà enregistrés sont conservés.'
    : 'Retirer « ' + cat + ' » de la liste ?';
  if (!confirm(msg)) return;
  state.categories = state.categories.filter(c => c !== cat);
  if (selectedCategory === cat) selectedCategory = null;
  saveState();
  renderCategories();
}

$('#btnAddCat').addEventListener('click', addCategory);
$('#fNewCat').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); addCategory(); }
});

/* ---------------- Formulaire : quantités ---------------- */

$$('.stepper').forEach(st => {
  const input = st.querySelector('input');
  st.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = clampInt(Number(input.value) + Number(btn.dataset.step));
      input.value = next;
      updateLiveTotal();
    });
  });
  input.addEventListener('input', updateLiveTotal);
  input.addEventListener('blur', () => { input.value = clampInt(input.value); updateLiveTotal(); });
});

function formQty() {
  return { dozens: clampInt($('#fDozens').value), half: clampInt($('#fHalf').value) };
}

function updateLiveTotal() {
  const q = formQty();
  const doz = dozensOf(q);
  const oy = oystersOf(q);
  $('#liveTotal').textContent = fmtDozens(doz) + ' · ' + fmtNum(oy) + ' ' + plural(oy, 'huître', 'huîtres');
}

/* ---------------- Formulaire : enregistrer ---------------- */

$('#entryForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const q = formQty();
  if (q.dozens === 0 && q.half === 0) {
    toast('Indiquez au moins une douzaine ou une demi-douzaine');
    return;
  }
  if (!selectedCategory) {
    toast('Choisissez une catégorie');
    return;
  }
  const date = $('#fDate').value || todayISO();

  if (editingId) {
    const entry = state.entries.find(e => e.id === editingId);
    if (entry) {
      Object.assign(entry, {
        date, category: selectedCategory,
        dozens: q.dozens, half: q.half,
        note: $('#fNote').value.trim().slice(0, 80)
      });
    }
    stopEditing();
    toast('Achat modifié');
    showView('histo');
  } else {
    state.entries.push(normalizeEntry({
      date, category: selectedCategory,
      dozens: q.dozens, half: q.half,
      note: $('#fNote').value.trim()
    }));
    toast('Achat enregistré 🦪');
    resetForm(date);
  }

  state.lastCategory = selectedCategory;
  saveState();
  renderToday();
});

function resetForm(keepDate) {
  $('#fDate').value = keepDate || todayISO();
  $('#fDozens').value = 0;
  $('#fHalf').value = 0;
  $('#fNote').value = '';
  updateLiveTotal();
}

function startEditing(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  $('#fDate').value = e.date;
  $('#fDozens').value = e.dozens;
  $('#fHalf').value = e.half;
  $('#fNote').value = e.note || '';
  if (!state.categories.includes(e.category)) state.categories.push(e.category);
  selectedCategory = e.category;
  $('#formTitle').textContent = "Modifier l'achat";
  $('#btnSubmit').textContent = 'Enregistrer les modifications';
  $('#btnCancelEdit').hidden = false;
  renderCategories();
  updateLiveTotal();
  showView('saisie');
}

function stopEditing() {
  editingId = null;
  $('#formTitle').textContent = 'Nouvel achat';
  $('#btnSubmit').textContent = "Enregistrer l'achat";
  $('#btnCancelEdit').hidden = true;
  resetForm(todayISO());
}

$('#btnCancelEdit').addEventListener('click', () => { stopEditing(); toast('Modification annulée'); });

function deleteEntry(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  if (!confirm('Supprimer cet achat du ' + fmtDateShort(e.date) + ' (' + fmtDozens(dozensOf(e)) + ') ?')) return;
  state.entries = state.entries.filter(x => x.id !== id);
  if (editingId === id) stopEditing();
  saveState();
  renderHistory();
  renderToday();
  toast('Achat supprimé');
}

/* ---------------- Résumé du jour ---------------- */

function renderToday() {
  const iso = todayISO();
  const list = state.entries.filter(e => e.date === iso);
  const el = $('#todaySummary');
  if (!list.length) {
    el.className = 'muted';
    el.textContent = "Aucun achat enregistré aujourd'hui.";
  } else {
    const doz = list.reduce((s, e) => s + dozensOf(e), 0);
    const oy = list.reduce((s, e) => s + oystersOf(e), 0);
    const cats = Array.from(new Set(list.map(e => e.category)));
    el.className = '';
    el.innerHTML = '<strong>' + escapeHtml(fmtDozens(doz)) + '</strong> — ' +
      fmtNum(oy) + ' ' + plural(oy, 'huître', 'huîtres') +
      '<br><span class="muted small">' + escapeHtml(cats.join(', ')) + '</span>';
  }

  const total = state.entries.reduce((s, e) => s + dozensOf(e), 0);
  $('#headerSub').textContent = state.entries.length
    ? fmtDozens(total) + ' au total'
    : "Carnet d'achats des vacances";
}

/* ---------------- Historique ---------------- */

function renderHistory() {
  const box = $('#histoList');
  const count = $('#histoCount');
  box.innerHTML = '';

  if (!state.entries.length) {
    count.textContent = '';
    box.innerHTML = '<div class="empty"><span>🦪</span>Aucun achat pour le moment.<br>Ajoutez votre premier achat dans l\'onglet « Saisie ».</div>';
    return;
  }

  const totalDoz = state.entries.reduce((s, e) => s + dozensOf(e), 0);
  count.textContent = state.entries.length + ' ' + plural(state.entries.length, 'achat', 'achats') +
    ' · ' + fmtDozens(totalDoz);

  const byDate = groupBy(state.entries, e => e.date);
  Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(date => {
    const list = byDate[date].slice().sort((a, b) => a.category.localeCompare(b.category, 'fr'));
    const dayDoz = list.reduce((s, e) => s + dozensOf(e), 0);

    const day = document.createElement('div');
    day.className = 'day';

    const head = document.createElement('div');
    head.className = 'day__head';
    head.innerHTML = '<span class="day__date">' + escapeHtml(fmtDateLong(date)) + '</span>' +
      '<span class="day__total">' + escapeHtml(fmtDozens(dayDoz)) + '</span>';
    day.appendChild(head);

    list.forEach(e => {
      const row = document.createElement('div');
      row.className = 'entry';

      const parts = [];
      if (e.dozens) parts.push(e.dozens + ' × 12');
      if (e.half) parts.push(e.half + ' × 6');
      const meta = parts.join(' + ') + ' = ' + fmtNum(oystersOf(e)) + ' ' + plural(oystersOf(e), 'huître', 'huîtres') +
        (e.note ? ' · ' + e.note : '');

      row.innerHTML =
        '<div class="entry__badge">' + escapeHtml(fmtNum(dozensOf(e))) + '</div>' +
        '<div class="entry__main">' +
          '<div class="entry__cat">' + escapeHtml(e.category) + '</div>' +
          '<div class="entry__meta">' + escapeHtml(meta) + '</div>' +
        '</div>';

      const acts = document.createElement('div');
      acts.className = 'entry__acts';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'icon-btn';
      edit.title = 'Modifier';
      edit.textContent = '✎';
      edit.addEventListener('click', () => startEditing(e.id));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn icon-btn--danger';
      del.title = 'Supprimer';
      del.textContent = '🗑';
      del.addEventListener('click', () => deleteEntry(e.id));

      acts.appendChild(edit);
      acts.appendChild(del);
      row.appendChild(acts);
      day.appendChild(row);
    });

    box.appendChild(day);
  });
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

/* ---------------- Statistiques ---------------- */

$$('#periodChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    statsPeriod = chip.dataset.period;
    $$('#periodChips .chip').forEach(c => c.classList.toggle('is-on', c === chip));
    renderStats();
  });
});

function periodEntries() {
  if (statsPeriod === 'all') return state.entries.slice();
  const days = Number(statsPeriod);
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() - (days - 1));
  return state.entries.filter(e => parseISO(e.date) >= limit);
}

function renderStats() {
  const entries = periodEntries();
  const kpis = $('#kpis');
  const chart = $('#chartDays');
  const byCat = $('#byCategory');
  const byFmt = $('#byFormat');
  const recs = $('#records');

  if (!entries.length) {
    kpis.innerHTML = '';
    const empty = '<div class="empty"><span>📊</span>Pas encore de données sur cette période.</div>';
    chart.innerHTML = empty;
    byCat.innerHTML = '';
    byFmt.innerHTML = '';
    recs.innerHTML = '';
    return;
  }

  const totalDoz = entries.reduce((s, e) => s + dozensOf(e), 0);
  const totalOy = entries.reduce((s, e) => s + oystersOf(e), 0);
  const byDate = groupBy(entries, e => e.date);
  const dates = Object.keys(byDate).sort();
  const nbDays = dates.length;

  /* --- KPI --- */
  kpis.innerHTML = [
    kpi(fmtNum(totalDoz), plural(totalDoz, 'douzaine', 'douzaines')),
    kpi(fmtNum(totalOy), plural(totalOy, 'huître', 'huîtres')),
    kpi(String(entries.length), plural(entries.length, 'achat', 'achats')),
    kpi(fmtNum(totalDoz / nbDays), 'douz. / jour d\'achat')
  ].join('');

  /* --- Graphique par jour --- */
  const dayVals = dates.map(d => ({
    date: d,
    doz: byDate[d].reduce((s, e) => s + dozensOf(e), 0)
  }));
  chart.innerHTML = barChartSVG(dayVals);

  /* --- Par catégorie --- */
  const catMap = groupBy(entries, e => e.category);
  const catRows = Object.keys(catMap).map(c => ({
    name: c,
    doz: catMap[c].reduce((s, e) => s + dozensOf(e), 0),
    n: catMap[c].length
  })).sort((a, b) => b.doz - a.doz);

  byCat.innerHTML = catRows.map(r => barRow(
    r.name,
    fmtNum(r.doz) + ' douz. · ' + Math.round(r.doz / totalDoz * 100) + '%',
    r.doz / catRows[0].doz
  )).join('');

  /* --- Par format --- */
  const dozOnly = entries.reduce((s, e) => s + e.dozens, 0);
  const halfOnly = entries.reduce((s, e) => s + e.half, 0);
  const dozPart = dozOnly * 1;
  const halfPart = halfOnly * 0.5;
  const maxPart = Math.max(dozPart, halfPart) || 1;
  byFmt.innerHTML =
    barRow('Douzaines', dozOnly + ' × 12 = ' + fmtNum(dozPart) + ' douz.', dozPart / maxPart) +
    barRow('Demi-douzaines', halfOnly + ' × 6 = ' + fmtNum(halfPart) + ' douz.', halfPart / maxPart);

  /* --- Records --- */
  const best = dayVals.slice().sort((a, b) => b.doz - a.doz)[0];
  const topCat = catRows[0];
  const spanDays = Math.round((parseISO(dates[dates.length - 1]) - parseISO(dates[0])) / 86400000) + 1;
  recs.innerHTML = [
    record('Meilleur jour', fmtDateShort(best.date) + ' — ' + fmtNum(best.doz) + ' douz.'),
    record('Catégorie préférée', topCat.name),
    record('Jours avec achat', nbDays + ' / ' + spanDays),
    record('Moyenne par achat', fmtNum(totalDoz / entries.length) + ' douz.'),
    record('Rythme sur la période', fmtNum(totalOy / spanDays) + ' huîtres / jour')
  ].join('');
}

function kpi(val, lab) {
  return '<div class="kpi"><div class="kpi__val">' + escapeHtml(val) + '</div>' +
    '<div class="kpi__lab">' + escapeHtml(lab) + '</div></div>';
}

function barRow(name, val, ratio) {
  const pct = Math.max(2, Math.round(ratio * 100));
  return '<div class="bar-row">' +
    '<div class="bar-row__top"><span class="bar-row__name">' + escapeHtml(name) + '</span>' +
    '<span class="bar-row__val">' + escapeHtml(val) + '</span></div>' +
    '<div class="bar-row__track"><div class="bar-row__fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
}

function record(lab, val) {
  return '<li><span>' + escapeHtml(lab) + '</span><b>' + escapeHtml(val) + '</b></li>';
}

/** Histogramme SVG (scrollable horizontalement si beaucoup de jours) */
function barChartSVG(data) {
  const slot = 40, padL = 6, padR = 6, top = 20, bottom = 26, plotH = 120;
  const w = Math.max(300, padL + padR + data.length * slot);
  const h = top + plotH + bottom;
  const max = Math.max.apply(null, data.map(d => d.doz)) || 1;
  const barW = 22;

  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
            '" role="img" aria-label="Douzaines achetées par jour">';

  // lignes de repère
  [0, 0.5, 1].forEach(f => {
    const y = top + plotH - f * plotH;
    svg += '<line class="grid" x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '"/>';
  });

  data.forEach((d, i) => {
    const cx = padL + i * slot + slot / 2;
    const bh = Math.max(3, (d.doz / max) * plotH);
    const y = top + plotH - bh;
    const cls = d.doz === max ? 'bar bar--max' : 'bar';
    svg += '<rect class="' + cls + '" x="' + (cx - barW / 2) + '" y="' + y + '" width="' + barW +
           '" height="' + bh + '" rx="4"/>';
    svg += '<text class="val" x="' + cx + '" y="' + (y - 5) + '">' + fmtNum(d.doz) + '</text>';
    svg += '<text class="lbl" x="' + cx + '" y="' + (top + plotH + 15) + '">' + fmtDateShort(d.date) + '</text>';
  });

  return svg + '</svg>';
}

/* ---------------- Export / import ---------------- */

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

$('#btnExportCsv').addEventListener('click', () => {
  if (!state.entries.length) return toast('Rien à exporter');
  const rows = [['Date', 'Categorie', 'Douzaines', 'Demi-douzaines', 'Total douzaines', 'Nb huitres', 'Note']];
  state.entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    rows.push([e.date, e.category, e.dozens, e.half, dozensOf(e), oystersOf(e), e.note || '']);
  });
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  download('huitres-' + todayISO() + '.csv', '﻿' + csv, 'text/csv');
  toast('CSV exporté');
});

$('#btnExportJson').addEventListener('click', () => {
  download('huitres-sauvegarde-' + todayISO() + '.json', JSON.stringify(state, null, 2), 'application/json');
  toast('Sauvegarde créée');
});

$('#btnImport').addEventListener('click', () => $('#fileImport').click());

$('#fileImport').addEventListener('change', ev => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data.entries) ? data.entries.filter(isValidEntry).map(normalizeEntry) : [];
      if (!incoming.length) return toast('Aucun achat trouvé dans ce fichier');
      if (!confirm('Restaurer ' + incoming.length + ' achat(s) ? Les données actuelles seront remplacées.')) return;
      state.entries = incoming;
      if (Array.isArray(data.categories) && data.categories.length) {
        state.categories = data.categories.filter(c => typeof c === 'string' && c.trim());
      }
      saveState();
      selectedCategory = null;
      renderAll();
      toast('Données restaurées');
    } catch (err) {
      toast('Fichier illisible');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
});

$('#btnReset').addEventListener('click', () => {
  if (!confirm('Effacer tous les achats enregistrés ? Cette action est définitive.')) return;
  state = blankState();
  saveState();
  selectedCategory = null;
  stopEditing();
  renderAll();
  toast('Historique effacé');
});

/* ---------------- Démarrage ---------------- */

function renderAll() {
  renderCategories();
  renderToday();
  renderHistory();
  renderStats();
  updateLiveTotal();
}

$('#fDate').value = todayISO();
renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
