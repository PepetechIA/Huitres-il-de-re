/* =========================================================
   MPX Huîtres — suivi des achats de douzaines d'huîtres
   Données 100 % locales (localStorage), aucune connexion.
   ========================================================= */
'use strict';

const STORAGE_KEY = 'huitres-ile-de-re.v1';
/* Historique interne des versions : conservé à part, il survit à « Tout effacer ». */
const SNAP_KEY = STORAGE_KEY + '.history';
const MAX_SNAPS = 12;
const BACKUP_MODES = ['each', 'daily', 'off'];

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
  return {
    entries: [],
    categories: DEFAULT_CATEGORIES.slice(),
    /* Historique de prix par catégorie : { "Fine de claire": [{date, price}, ...] }, trié par date croissante.
       Le prix appliqué à un achat est celui du point le plus récent à sa date ou avant — jamais
       calculé « aujourd'hui », toujours recalculé à partir de la date de l'achat lui-même. */
    priceHistory: {},
    lastCategory: null,
    settings: { autoBackup: 'daily', lastBackupAt: null }
  };
}

/** Ne garde que les points {date, price} valides d'un historique de prix quelconque. */
function sanitizePriceHistory(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).forEach(cat => {
    if (!cat.trim() || !Array.isArray(obj[cat])) return;
    const points = obj[cat]
      .filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && isFinite(Number(p.price)) && Number(p.price) > 0)
      .map(p => ({ date: p.date, price: Math.round(Number(p.price) * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (points.length) out[cat.trim()] = points;
  });
  return out;
}

/**
 * Migration depuis l'ancien format (un seul prix « courant » par catégorie, sans date).
 * Reconstruit un historique à partir du prix figé sur chaque achat déjà enregistré (converti en
 * point à sa propre date), plus le prix courant comme valeur de repli depuis le tout début.
 */
function migrateFlatPrices(flat, rawEntries) {
  const byCategoryDate = {};
  Object.keys(flat || {}).forEach(cat => {
    const v = Number(flat[cat]);
    if (!cat.trim() || !isFinite(v) || v <= 0) return;
    byCategoryDate[cat] = byCategoryDate[cat] || {};
    byCategoryDate[cat]['0001-01-01'] = Math.round(v * 100) / 100;
  });
  (rawEntries || []).forEach(e => {
    const price = Number(e.pricePerDozen);
    if (!isFinite(price) || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return;
    const cat = (typeof e.category === 'string' && e.category.trim()) ? e.category.trim() : 'Autre';
    byCategoryDate[cat] = byCategoryDate[cat] || {};
    byCategoryDate[cat][e.date] = Math.round(price * 100) / 100;
  });
  const history = {};
  Object.keys(byCategoryDate).forEach(cat => {
    const cleaned = [];
    Object.keys(byCategoryDate[cat]).sort().forEach(date => {
      const price = byCategoryDate[cat][date];
      const prev = cleaned[cleaned.length - 1];
      if (!prev || prev.price !== price) cleaned.push({ date, price });
    });
    history[cat] = cleaned;
  });
  return history;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const data = JSON.parse(raw);
    const state = blankState();
    const rawEntries = Array.isArray(data.entries) ? data.entries.filter(isValidEntry) : [];
    state.entries = rawEntries.map(normalizeEntry);
    if (Array.isArray(data.categories) && data.categories.length) {
      state.categories = data.categories.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim());
    }
    if (data.priceHistory && typeof data.priceHistory === 'object') {
      state.priceHistory = sanitizePriceHistory(data.priceHistory);
    } else if (data.categoryPrices && typeof data.categoryPrices === 'object') {
      state.priceHistory = migrateFlatPrices(data.categoryPrices, rawEntries);
    }
    if (typeof data.lastCategory === 'string') state.lastCategory = data.lastCategory;
    if (data.settings && typeof data.settings === 'object') {
      if (BACKUP_MODES.includes(data.settings.autoBackup)) {
        state.settings.autoBackup = data.settings.autoBackup;
      }
      if (typeof data.settings.lastBackupAt === 'string') {
        state.settings.lastBackupAt = data.settings.lastBackupAt;
      }
    }
    return state;
  } catch (err) {
    console.warn('Données illisibles, repartons de zéro.', err);
    return blankState();
  }
}

/** Historique de prix depuis les données d'une sauvegarde/version quelconque (nouveau ou ancien format). */
function priceHistoryFrom(data) {
  if (!data) return {};
  if (data.priceHistory && typeof data.priceHistory === 'object') {
    return sanitizePriceHistory(data.priceHistory);
  }
  if (data.categoryPrices && typeof data.categoryPrices === 'object') {
    return migrateFlatPrices(data.categoryPrices, (data.entries || []).filter(isValidEntry));
  }
  return {};
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
    markSaved(true);
    return true;
  } catch (err) {
    markSaved(false);
    toast("Impossible d'enregistrer (stockage plein ?)");
    return false;
  }
}

/* ---------------- Enregistrement & sauvegarde automatiques ---------------- */

/** Indicateur « c'est enregistré », sous le formulaire. */
function markSaved(ok) {
  const el = $('#saveState');
  if (!el) return;
  if (ok) {
    const h = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    el.className = 'save-state';
    el.textContent = 'Enregistré automatiquement à ' + h + ' sur ce téléphone.';
  } else {
    el.className = 'save-state is-err';
    el.textContent = "Échec de l'enregistrement : stockage du navigateur plein ou bloqué.";
  }
}

/**
 * Demande au navigateur de ne pas effacer les données tout seul
 * (nettoyage automatique quand la mémoire manque).
 */
async function ensurePersistentStorage() {
  const el = $('#storageState');
  if (!navigator.storage || !navigator.storage.persist) {
    if (el) {
      el.className = 'save-state is-warn';
      el.textContent = 'Données enregistrées sur ce téléphone. Ce navigateur ne permet pas de les protéger : gardez un fichier de sauvegarde.';
    }
    return null;
  }
  let granted = false;
  try {
    granted = await navigator.storage.persisted() || await navigator.storage.persist();
  } catch (err) { granted = false; }
  if (el) {
    el.className = granted ? 'save-state' : 'save-state is-warn';
    el.textContent = granted
      ? 'Données protégées : le navigateur ne les effacera pas tout seul.'
      : 'Données enregistrées, mais le navigateur peut les effacer s\'il manque de place : gardez un fichier de sauvegarde.';
  }
  return granted;
}

/** Copie horodatée de l'état courant, avant modification (permet de revenir en arrière). */
function pushSnapshot() {
  if (!state.entries.length) return; // rien à conserver : pas de version vide dans la liste
  try {
    const snaps = loadSnapshots();
    const payload = { entries: state.entries, categories: state.categories, priceHistory: state.priceHistory };
    const last = snaps[0];
    if (last && JSON.stringify(last.data) === JSON.stringify(payload)) return;
    snaps.unshift({ at: new Date().toISOString(), data: payload });
    writeSnapshots(snaps.slice(0, MAX_SNAPS));
  } catch (err) {
    /* Une copie de secours manquante ne doit jamais bloquer une saisie. */
  }
}

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(s => s && s.at && s.data) : [];
  } catch (err) {
    return [];
  }
}

function writeSnapshots(snaps) {
  let list = snaps.slice();
  while (list.length) {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(list));
      return;
    } catch (err) {
      list = list.slice(0, Math.floor(list.length / 2)); // stockage plein : on allège
    }
  }
  try { localStorage.removeItem(SNAP_KEY); } catch (err) {}
}

function restoreSnapshot(at) {
  const snap = loadSnapshots().find(s => s.at === at);
  if (!snap) return;
  const nb = (snap.data.entries || []).length;
  if (!confirm('Revenir à la version du ' + fmtDateTime(at) + ' (' + nb + ' achat(s)) ?\nLa version actuelle sera d\'abord ajoutée à la liste.')) return;
  pushSnapshot();
  state.entries = (snap.data.entries || []).filter(isValidEntry).map(normalizeEntry);
  if (Array.isArray(snap.data.categories) && snap.data.categories.length) {
    state.categories = snap.data.categories.slice();
  }
  state.priceHistory = priceHistoryFrom(snap.data);
  selectedCategory = null;
  saveState();
  renderAll();
  toast('Version restaurée');
}

/** Écrit le fichier de sauvegarde. auto = déclenché tout seul après un enregistrement. */
function backupToFile(auto) {
  state.settings.lastBackupAt = new Date().toISOString();
  saveState();
  download('huitres-sauvegarde-' + todayISO() + '.json', JSON.stringify(state, null, 2), 'application/json');
  renderBackupPanel();
  toast(auto ? 'Sauvegarde automatique créée' : 'Fichier de sauvegarde créé');
}

/** Appelé après chaque modification des achats, dans le geste de l'utilisateur. */
function maybeAutoBackup() {
  const mode = state.settings.autoBackup;
  if (mode === 'off') return;
  if (mode === 'daily') {
    const last = state.settings.lastBackupAt;
    if (last && last.slice(0, 10) === todayISO()) return;
  }
  backupToFile(true);
}

/** À appeler après toute modification des achats. */
function afterChange() {
  saveState();
  renderBackupPanel();
  maybeAutoBackup();
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

/**
 * Prix à la douzaine d'une catégorie, à une date donnée : le point d'historique le plus récent
 * à cette date ou avant. 0 si aucun prix n'était encore connu à cette date (jamais de prix
 * futur appliqué rétroactivement).
 */
function priceAt(category, dateISO) {
  const points = state.priceHistory[category];
  if (!points || !points.length) return 0;
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].date <= dateISO) best = points[i].price;
    else break; // points triés par date croissante
  }
  return best;
}

/** Coût de l'achat, au prix en vigueur pour sa catégorie à sa date d'achat (recalculé, jamais figé). */
const costOf = e => dozensOf(e) * priceAt(e.category, e.date);

function setPricePoint(cat, date, price) {
  const rounded = Math.round(price * 100) / 100;
  const points = (state.priceHistory[cat] || []).filter(p => p.date !== date);
  points.push({ date, price: rounded });
  state.priceHistory[cat] = points.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
}

function removePricePoint(cat, date) {
  if (!state.priceHistory[cat]) return;
  state.priceHistory[cat] = state.priceHistory[cat].filter(p => p.date !== date);
  if (!state.priceHistory[cat].length) delete state.priceHistory[cat];
  saveState();
}

function fmtNum(n) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function fmtEUR(n) {
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
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

function fmtDateTime(isoDateTime) {
  const d = new Date(isoDateTime);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
  if (name === 'histo') { renderHistory(); renderCategoryPrices(); }
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
      updateLiveTotal();
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
  renderCategoryPrices();
}

function removeCategory(cat) {
  const used = state.entries.some(e => e.category === cat);
  const msg = used
    ? 'Retirer « ' + cat + ' » de la liste ? Les achats déjà enregistrés sont conservés.'
    : 'Retirer « ' + cat + ' » de la liste ?';
  if (!confirm(msg)) return;
  state.categories = state.categories.filter(c => c !== cat);
  /* L'historique de prix de la catégorie est conservé : les achats déjà enregistrés sous ce nom
     gardent leur coût correct, même si la catégorie n'est plus proposée à la saisie. */
  if (selectedCategory === cat) selectedCategory = null;
  saveState();
  renderCategories();
  renderCategoryPrices();
}

/* ---------------- Prix par douzaine, par catégorie (avec historique daté) ---------------- */

function renderCategoryPrices() {
  const box = $('#catPriceList');
  if (!box) return;
  box.innerHTML = '';
  if (!state.categories.length) {
    box.innerHTML = '<p class="muted small" style="margin:0">Ajoutez d\'abord une catégorie dans l\'onglet Saisie.</p>';
    return;
  }
  state.categories.forEach(cat => box.appendChild(categoryPriceCard(cat)));
}

function categoryPriceCard(cat) {
  const card = document.createElement('div');
  card.className = 'price-cat';

  const head = document.createElement('div');
  head.className = 'price-cat__head';
  const name = document.createElement('span');
  name.className = 'price-cat__name';
  name.textContent = cat;
  const current = document.createElement('span');
  current.className = 'price-cat__current';
  const currentPrice = priceAt(cat, todayISO());
  current.textContent = currentPrice > 0 ? fmtEUR(currentPrice) + ' actuellement' : 'Aucun prix';
  head.appendChild(name);
  head.appendChild(current);
  card.appendChild(head);

  const addRow = document.createElement('div');
  addRow.className = 'price-cat__add';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayISO();
  dateInput.setAttribute('aria-label', "Prix en vigueur à partir de cette date, pour " + cat);

  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.min = '0';
  priceInput.step = '0.10';
  priceInput.inputMode = 'decimal';
  priceInput.placeholder = 'Prix';
  priceInput.setAttribute('aria-label', 'Prix à la douzaine pour ' + cat);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--ghost btn--sm';
  addBtn.textContent = 'Enregistrer ce prix';
  addBtn.addEventListener('click', () => {
    const val = parseFloat(priceInput.value);
    if (!dateInput.value) return toast('Choisissez une date');
    if (!isFinite(val) || val <= 0) return toast('Indiquez un prix');
    setPricePoint(cat, dateInput.value, val);
    priceInput.value = '';
    renderCategoryPrices();
    renderStats();
    updateLiveTotal();
    toast('Prix enregistré');
  });

  addRow.appendChild(dateInput);
  addRow.appendChild(priceInput);
  addRow.appendChild(addBtn);
  card.appendChild(addRow);

  const points = (state.priceHistory[cat] || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  if (points.length) {
    const list = document.createElement('ul');
    list.className = 'price-cat__history';
    points.forEach(p => {
      const li = document.createElement('li');
      const lbl = document.createElement('span');
      lbl.textContent = 'Depuis le ' + fmtDateShort(p.date);
      const val = document.createElement('b');
      val.textContent = fmtEUR(p.price);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'price-cat__del';
      del.textContent = '×';
      del.title = 'Supprimer ce prix';
      del.addEventListener('click', () => {
        removePricePoint(cat, p.date);
        renderCategoryPrices();
        renderStats();
        updateLiveTotal();
      });
      li.appendChild(lbl);
      li.appendChild(val);
      li.appendChild(del);
      list.appendChild(li);
    });
    card.appendChild(list);
  }

  return card;
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

/* Le prix dépend de la date choisie : recalculer l'estimation si elle change (rattrapage d'un achat passé). */
$('#fDate').addEventListener('input', updateLiveTotal);

function updateLiveTotal() {
  const q = formQty();
  const doz = dozensOf(q);
  const oy = oystersOf(q);
  let txt = fmtDozens(doz) + ' · ' + fmtNum(oy) + ' ' + plural(oy, 'huître', 'huîtres');
  const dateVal = $('#fDate').value || todayISO();
  const price = selectedCategory ? priceAt(selectedCategory, dateVal) : 0;
  if (price > 0) txt += ' · environ ' + fmtEUR(doz * price);
  $('#liveTotal').textContent = txt;
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
  pushSnapshot();

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
  afterChange();
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
  pushSnapshot();
  state.entries = state.entries.filter(x => x.id !== id);
  if (editingId === id) stopEditing();
  afterChange();
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
        (costOf(e) > 0 ? ' · ' + fmtEUR(costOf(e)) : '') +
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
  const costChart = $('#chartCost');
  const byCat = $('#byCategory');
  const byCost = $('#byCost');
  const byFmt = $('#byFormat');
  const recs = $('#records');

  if (!entries.length) {
    kpis.innerHTML = '';
    const empty = '<div class="empty"><span>📊</span>Pas encore de données sur cette période.</div>';
    chart.innerHTML = empty;
    if (costChart) costChart.innerHTML = '';
    byCat.innerHTML = '';
    if (byCost) byCost.innerHTML = '';
    byFmt.innerHTML = '';
    recs.innerHTML = '';
    return;
  }

  const totalDoz = entries.reduce((s, e) => s + dozensOf(e), 0);
  const totalOy = entries.reduce((s, e) => s + oystersOf(e), 0);
  const totalCost = entries.reduce((s, e) => s + costOf(e), 0);
  const hasCost = totalCost > 0;
  const byDate = groupBy(entries, e => e.date);
  const dates = Object.keys(byDate).sort();
  const nbDays = dates.length;

  /* --- KPI --- */
  const kpiList = [
    kpi(fmtNum(totalDoz), plural(totalDoz, 'douzaine', 'douzaines')),
    kpi(fmtNum(totalOy), plural(totalOy, 'huître', 'huîtres')),
    kpi(String(entries.length), plural(entries.length, 'achat', 'achats')),
    kpi(fmtNum(totalDoz / nbDays), 'douz. / jour d\'achat')
  ];
  if (hasCost) kpiList.push(kpi(fmtEUR(totalCost), 'dépensés'));
  kpis.innerHTML = kpiList.join('');

  /* --- Graphique par jour --- */
  const dayVals = dates.map(d => ({
    date: d,
    val: byDate[d].reduce((s, e) => s + dozensOf(e), 0)
  }));
  chart.innerHTML = barChartSVG(dayVals, { ariaLabel: 'Douzaines achetées par jour' });

  /* --- Par catégorie --- */
  const catMap = groupBy(entries, e => e.category);
  const catRows = Object.keys(catMap).map(c => ({
    name: c,
    doz: catMap[c].reduce((s, e) => s + dozensOf(e), 0),
    n: catMap[c].length,
    cost: catMap[c].reduce((s, e) => s + costOf(e), 0)
  })).sort((a, b) => b.doz - a.doz);

  byCat.innerHTML = catRows.map(r => barRow(
    r.name,
    fmtNum(r.doz) + ' douz. · ' + Math.round(r.doz / totalDoz * 100) + '%' +
      (r.cost > 0 ? ' · ' + fmtEUR(r.cost) : ''),
    r.doz / catRows[0].doz
  )).join('');

  /* --- Dépenses (jour et catégorie) --- */
  if (costChart) {
    if (!hasCost) {
      costChart.innerHTML = noCostHint();
    } else {
      const dayCostVals = dates.map(d => ({
        date: d,
        val: byDate[d].reduce((s, e) => s + costOf(e), 0)
      }));
      costChart.innerHTML = barChartSVG(dayCostVals, { ariaLabel: 'Dépenses par jour', fmtVal: fmtEUR });
    }
  }
  if (byCost) {
    if (!hasCost) {
      byCost.innerHTML = noCostHint();
    } else {
      const costRows = catRows.filter(r => r.cost > 0).slice().sort((a, b) => b.cost - a.cost);
      byCost.innerHTML =
        '<div class="chart">' + pieChartSVG(costRows, totalCost) + '</div>' +
        pieLegend(costRows, totalCost);
    }
  }

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
  const best = dayVals.slice().sort((a, b) => b.val - a.val)[0];
  const topCat = catRows[0];
  const spanDays = Math.round((parseISO(dates[dates.length - 1]) - parseISO(dates[0])) / 86400000) + 1;
  const recList = [
    record('Meilleur jour', fmtDateShort(best.date) + ' — ' + fmtNum(best.val) + ' douz.'),
    record('Catégorie préférée', topCat.name),
    record('Jours avec achat', nbDays + ' / ' + spanDays),
    record('Moyenne par achat', fmtNum(totalDoz / entries.length) + ' douz.'),
    record('Rythme sur la période', fmtNum(totalOy / spanDays) + ' huîtres / jour')
  ];
  if (hasCost) recList.push(record('Prix moyen', fmtEUR(totalCost / totalDoz) + ' / douzaine'));
  recs.innerHTML = recList.join('');
}

/** Message d'aide quand aucun coût n'est calculable, avec la cause la plus probable. */
function noCostHint() {
  const anyPriceDefined = Object.keys(state.priceHistory).length > 0;
  const msg = anyPriceDefined
    ? "Aucun achat de cette période n'a de prix connu à sa date. Vérifiez, dans l'onglet " +
      'Historique, que la date du prix est bien antérieure ou égale à la date de ces achats.'
    : "Indiquez un prix par douzaine dans l'onglet Historique pour voir apparaître vos dépenses ici.";
  return '<p class="muted small" style="margin:0">' + escapeHtml(msg) + '</p>';
}

/* Palette cyclique pour le camembert des dépenses : dérivée des teintes de l'app (mer, sable). */
const PIE_COLORS = ['#0f8493', '#f6b352', '#0d5b66', '#c98a3e', '#5aa7a0', '#e07856', '#8fb8bd', '#b3542f', '#3f6b73', '#d9a441'];

/** Camembert SVG (donut) : une part par ligne {name, cost}, triées avant l'appel. */
function pieChartSVG(rows, total) {
  const size = 180, cx = size / 2, cy = size / 2, r = 62, strokeW = 30;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  let svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size +
    '" role="img" aria-label="Répartition des dépenses par catégorie">' +
    '<g transform="rotate(-90 ' + cx + ' ' + cy + ')">';
  rows.forEach((row, i) => {
    const frac = row.cost / total;
    const segLen = Math.max(0, frac * circumference - 1.5); // léger espace entre les parts
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' +
      PIE_COLORS[i % PIE_COLORS.length] + '" stroke-width="' + strokeW + '" stroke-linecap="round" ' +
      'stroke-dasharray="' + segLen + ' ' + (circumference - segLen) + '" stroke-dashoffset="' + (-offset) + '"/>';
    offset += frac * circumference;
  });
  svg += '</g>';
  svg += '<text x="' + cx + '" y="' + (cy - 3) + '" class="pie-total-val">' + escapeHtml(fmtEUR(total)) + '</text>';
  svg += '<text x="' + cx + '" y="' + (cy + 15) + '" class="pie-total-lab">dépensés</text>';
  return svg + '</svg>';
}

/** Légende du camembert : pastille de couleur, nom, montant et %, dans le même ordre que les parts. */
function pieLegend(rows, total) {
  return '<ul class="pie-legend">' + rows.map((row, i) => {
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const pct = Math.round(row.cost / total * 100);
    return '<li><span class="pie-legend__dot" style="background:' + color + '"></span>' +
      '<span class="pie-legend__name">' + escapeHtml(row.name) + '</span>' +
      '<b>' + escapeHtml(fmtEUR(row.cost)) + ' · ' + pct + '%</b></li>';
  }).join('') + '</ul>';
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
function barChartSVG(data, opts) {
  opts = opts || {};
  const ariaLabel = opts.ariaLabel || 'Douzaines achetées par jour';
  const fmtVal = opts.fmtVal || fmtNum;
  const slot = 40, padL = 6, padR = 6, top = 20, bottom = 26, plotH = 120;
  const w = Math.max(300, padL + padR + data.length * slot);
  const h = top + plotH + bottom;
  const max = Math.max.apply(null, data.map(d => d.val)) || 1;
  const barW = 22;

  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
            '" role="img" aria-label="' + escapeHtml(ariaLabel) + '">';

  // lignes de repère
  [0, 0.5, 1].forEach(f => {
    const y = top + plotH - f * plotH;
    svg += '<line class="grid" x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '"/>';
  });

  data.forEach((d, i) => {
    const cx = padL + i * slot + slot / 2;
    const bh = Math.max(3, (d.val / max) * plotH);
    const y = top + plotH - bh;
    const cls = d.val === max ? 'bar bar--max' : 'bar';
    svg += '<rect class="' + cls + '" x="' + (cx - barW / 2) + '" y="' + y + '" width="' + barW +
           '" height="' + bh + '" rx="4"/>';
    svg += '<text class="val" x="' + cx + '" y="' + (y - 5) + '">' + escapeHtml(fmtVal(d.val)) + '</text>';
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
  const rows = [['Date', 'Categorie', 'Douzaines', 'Demi-douzaines', 'Total douzaines', 'Nb huitres', 'Prix/douzaine', 'Cout', 'Note']];
  state.entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    rows.push([e.date, e.category, e.dozens, e.half, dozensOf(e), oystersOf(e), priceAt(e.category, e.date), costOf(e), e.note || '']);
  });
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  download('huitres-' + todayISO() + '.csv', '﻿' + csv, 'text/csv');
  toast('CSV exporté');
});

$('#btnExportJson').addEventListener('click', () => backupToFile(false));

/* Choix du mode de sauvegarde automatique */
$$('#autoBackupChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.settings.autoBackup = chip.dataset.mode;
    saveState();
    renderBackupPanel();
    if (chip.dataset.mode === 'off') {
      toast('Sauvegarde automatique désactivée');
    } else {
      toast('Sauvegarde automatique activée');
      maybeAutoBackup();
    }
  });
});

/** Carte « Sauvegarde automatique » : état du stockage, mode, versions précédentes. */
function renderBackupPanel() {
  $$('#autoBackupChips .chip').forEach(c => {
    c.classList.toggle('is-on', c.dataset.mode === state.settings.autoBackup);
  });

  const modeTxt = {
    each: 'Un fichier est créé à chaque enregistrement.',
    daily: "Un fichier est créé automatiquement au premier enregistrement de la journée.",
    off: 'Aucun fichier automatique : les données restent uniquement dans ce navigateur.'
  }[state.settings.autoBackup];
  const last = state.settings.lastBackupAt
    ? ' Dernier fichier : ' + fmtDateTime(state.settings.lastBackupAt) + '.'
    : ' Aucun fichier créé pour le moment.';
  $('#autoBackupState').textContent = modeTxt + last;

  const box = $('#snapList');
  const snaps = loadSnapshots();
  if (!snaps.length) {
    box.innerHTML = '<p class="muted small" style="margin:0">Les versions précédentes apparaîtront ici après vos premiers enregistrements.</p>';
    return;
  }
  box.innerHTML = '';
  snaps.forEach(snap => {
    const list = (snap.data.entries || []).filter(isValidEntry).map(normalizeEntry);
    const doz = list.reduce((sum, e) => sum + dozensOf(e), 0);

    const row = document.createElement('div');
    row.className = 'snap';
    row.innerHTML = '<div class="snap__main">' +
      '<div class="snap__when">' + escapeHtml(fmtDateTime(snap.at)) + '</div>' +
      '<div class="snap__what">' + list.length + ' ' + plural(list.length, 'achat', 'achats') +
      ' · ' + escapeHtml(fmtDozens(doz)) + '</div></div>';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--sm';
    btn.textContent = 'Restaurer';
    btn.addEventListener('click', () => restoreSnapshot(snap.at));
    row.appendChild(btn);
    box.appendChild(row);
  });
}

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
      if (!confirm('Restaurer ' + incoming.length + ' achat(s) ? Les données actuelles seront remplacées.\nUne copie de la version actuelle est conservée dans « Versions précédentes ».')) return;
      pushSnapshot();
      state.entries = incoming;
      if (Array.isArray(data.categories) && data.categories.length) {
        state.categories = data.categories.filter(c => typeof c === 'string' && c.trim());
      }
      state.priceHistory = priceHistoryFrom(data);
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
  if (!confirm('Effacer tous les achats enregistrés ?\nUne copie est conservée dans « Versions précédentes » pour pouvoir revenir en arrière.')) return;
  pushSnapshot();
  const keptSettings = state.settings;
  state = blankState();
  state.settings = keptSettings;
  saveState();
  selectedCategory = null;
  stopEditing();
  renderAll();
  toast('Historique effacé');
});

/* ---------------- Démarrage ---------------- */

function renderAll() {
  renderCategories();
  renderCategoryPrices();
  renderToday();
  renderHistory();
  renderStats();
  renderBackupPanel();
  updateLiveTotal();
}

$('#fDate').value = todayISO();
renderAll();
ensurePersistentStorage();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
