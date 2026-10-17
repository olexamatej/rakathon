import { newId } from './lists.js';
import {
  DOCTOR_STORAGE_KEY, createDoctorState, addList, touch, validateItem,
  normalizePin, isPin, formatMedicineLines, formatMedicineInline, applySubstances,
} from './doctor.js';
import { fetchListByPin, fetchInteractions, loadRegimenDrugs, loadSuklNames, loadSuklSubstances, researchInteraction, RESEARCH_SITES } from './doctor-services.js';
import { loadRegimens } from './services.js';
import { createAutocomplete } from './autocomplete.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const date = value => new Intl.DateTimeFormat('cs', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('cs', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const icons = {
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.400-3.800 9c-2.500-2.600-3.800-5.600-3.800-9s1.300-6.400 3.800-9z"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

let state = createDoctorState();
let loading = false;
let pinRequest = 0;
let regimenDrugs = {}; // regimen name -> drug names, filled asynchronously
const research = new Map(); // `${list id}|${pair}|${site}` -> { status, data, error, controller }
const interactions = new Map(); // list id -> { status, data, error, token, signature }

// What the interactions depend on: the active substances of every medicine (its name when the
// catalogue does not know them) and the regimen's drugs (its name when they are unknown). Dosage,
// schedule and package size do not matter, so editing them never clears the interactions.
function interactionSignature(list) {
  const medicines = list.items
    .map(item => (item.substances?.length ? item.substances : [item.name.trim()]).filter(Boolean).map(name => name.toLowerCase()).sort().join('+'))
    .filter(Boolean).sort();
  const regimen = list.regimen.trim()
    ? (regimenDrugs[list.regimen] || [list.regimen.trim()]).map(name => name.toLowerCase()).sort()
    : [];
  return JSON.stringify([medicines, regimen]);
}

// A doctor's browser must never retain previously opened patient lists.
try { localStorage.removeItem(DOCTOR_STORAGE_KEY); } catch { /* Private browsing may disable storage. */ }
if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);

const currentList = () => state.lists[0] || null;

window.addEventListener('pagehide', () => {
  state = createDoctorState();
  for (const entry of interactions.values()) entry.controller?.abort();
  for (const entry of research.values()) entry.controller?.abort();
  interactions.clear();
  research.clear();
  detailRows.clear();
  if (detailsDialog.open) detailsDialog.close();
  render();
});

const regimenOf = list => ({ name: list.regimen, drugs: regimenDrugs[list.regimen] || [] });

const SEVERITY = {
  contraindicated: { label: 'Kontraindikováno', icon: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>' },
  major: { label: 'Závažná', icon: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17.5v.01"/>' },
  moderate: { label: 'Střední', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.01"/>' },
  minor: { label: 'Mírná', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>' },
  unknown: { label: 'Neznámá', icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01"/>' },
};
const EVIDENCE = { established: 'potvrzené', limited: 'omezené', theoretical: 'teoretické', unknown: 'neurčené' };

function findingView(finding) {
  const references = (finding.evidence?.references || []).filter(ref => /^https?:\/\//.test(ref.url));
  return `<section class="finding">
    <p class="finding-summary">${escape(finding.summary)}</p>
    ${finding.mechanism ? `<p class="finding-text"><strong>Mechanismus:</strong> ${escape(finding.mechanism)}</p>` : ''}
    ${finding.clinicalEffects?.length ? `<ul class="finding-effects">${finding.clinicalEffects.map(effect => `<li>${escape(effect)}</li>`).join('')}</ul>` : ''}
    <p class="finding-meta">Důkazy: ${escape(EVIDENCE[finding.evidence?.level] || EVIDENCE.unknown)}${references.map(ref => ` · <a href="${escape(ref.url)}" target="_blank" rel="noopener noreferrer">${escape(ref.title)} ↗</a>`).join('')}</p>
  </section>`;
}

const researchKey = (list, names, site) => `${list.id}|${names.map(name => name.toLowerCase()).sort().join('+')}|${site}`;
let detailsTarget = null; // { list, row } while the details dialog is open
const detailRows = new Map(); // `${list id}|${canonical names}` -> interaction row, so a card can open its dialog
const rowKey = (list, names) => `${list.id}|${names.map(name => name.toLowerCase()).sort().join('+')}`;

const SITE_STATE = {
  queued: { label: 'čeká', icon: '' },
  loading: { label: 'hledám', icon: '' },
  found: { label: 'nalezeno', icon: '✓' },
  not_found: { label: 'nenalezeno', icon: '–' },
  inconclusive: { label: 'nejisté', icon: '?' },
  error: { label: 'chyba', icon: '!' },
};

const SITE_SHORT = { 'reference.medscape.com': 'medscape.com' }; // keeps the pill row on one line

function sitePill({ list, row }, site, index) {
  const entry = research.get(researchKey(list, row.names, site));
  const state = entry?.status === 'done' ? entry.data.status : entry?.status || 'queued';
  const meta = SITE_STATE[state];
  // Hover/focus shows the whole answer of the agent, not just the state.
  const answer = entry?.status === 'done' ? entry.data.summary : entry?.status === 'error' ? `${entry.error} Klikněte pro opakování.` : '';
  const tipId = `site-tip-${index}`;
  const tag = state === 'error' ? 'button' : 'span';
  const attrs = ` aria-describedby="${tipId}"${state === 'error'
    ? ` type="button" data-action="research-site" data-site="${escape(site)}" aria-label="${escape(site)}: ${meta.label}. Zkusit znovu."`
    : ' tabindex="0"'}`;
  return `<li class="site-item"><${tag} class="site-pill state-${state}"${attrs}>${meta.icon ? `<span class="pill-icon" aria-hidden="true">${meta.icon}</span>` : '<span class="spinner" aria-hidden="true"></span>'}${escape(SITE_SHORT[site] || site)}<span class="sr-only"> – ${meta.label}</span></${tag}>
    <span class="pill-tip" id="${tipId}" role="tooltip"><strong>${escape(site)} · ${meta.label}</strong>${answer ? `<span>${escape(answer)}</span>` : ''}</span></li>`;
}

function siteResult({ list, row }, site) {
  const entry = research.get(researchKey(list, row.names, site));
  if (entry?.status !== 'done' || entry.data.status !== 'found' || !entry.data.url) return '';
  const { url, summary } = entry.data;
  return `<li class="site-result"><a class="research-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(site)} ↗</a>
    <p>${escape(summary)}</p></li>`;
}

// Dialog body: web research for one pair on every supported site.
function detailsView(target) {
  const entries = RESEARCH_SITES.map(site => research.get(researchKey(target.list, target.row.names, site)));
  const finished = entries.filter(entry => entry?.status === 'done' || entry?.status === 'error').length;
  const results = RESEARCH_SITES.map(site => siteResult(target, site)).join('');
  return `<p class="research-progress" aria-live="polite">Hotovo ${finished} z ${RESEARCH_SITES.length} stránek</p>
    <ul class="site-pills" aria-label="Stav hledání na stránkách">${RESEARCH_SITES.map((site, index) => sitePill(target, site, index)).join('')}</ul>
    ${results ? `<ul class="site-results" aria-label="Nalezené výsledky">${results}</ul>` : ''}`;
}

function renderDetails() {
  if (detailsTarget) $('#details-body').innerHTML = detailsView(detailsTarget);
}

function interactionCard(row, list) {
  detailRows.set(rowKey(list, row.names), row);
  const severity = SEVERITY[row.severity] || SEVERITY.unknown;
  return `<article class="interaction-card sev-${row.severity in SEVERITY ? row.severity : 'unknown'}">
    <span class="sev-icon" title="${escape(severity.label)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${severity.icon}</svg><span class="sr-only">Závažnost: ${escape(severity.label)}</span></span>
    <div class="interaction-body">
      <p class="pair"><strong>${escape(row.a)}</strong><span aria-hidden="true">+</span><span class="sr-only">a</span><strong>${escape(row.b)}</strong></p>
      <p class="summary">${escape(severity.label)}</p>
      <button type="button" class="small-button details-button" data-action="details" data-key="${escape(rowKey(list, row.names))}">${icon('globe')} Podrobnosti z webu</button>
    </div>
    <div class="findings">${row.findings.map(findingView).join('')}</div>
  </article>`;
}

function interactionCards(rows, list) {
  if (!rows.length) return '<p class="muted">Nebyly nalezeny žádné známé interakce.</p>';
  return `<div class="card-grid">${rows.map(row => interactionCard(row, list)).join('')}</div>`;
}

function interactionResults(data, list) {
  const medicines = list.items.length > 1
    ? interactionCards(data.medicines, list)
    : '<p class="muted">Není co porovnávat – seznam obsahuje méně než dvě léčiva.</p>';
  let regimen = '';
  if (data.regimen) {
    const drugs = regimenDrugs[data.regimen.name] || [];
    regimen = `<section class="regimen-panel" aria-labelledby="regimen-interactions-title">
      <div class="panel-head"><h3 id="regimen-interactions-title">Onkologický režim <span>${escape(data.regimen.name)}</span></h3>
        <p>Interakce látek režimu s léčivy pacienta.</p></div>
      ${!drugs.length ? '<p class="muted">Pro tento režim nejsou k dispozici látky, interakce nelze načíst.</p>'
        : !list.items.length ? '<p class="muted">Seznam neobsahuje žádná léčiva k porovnání.</p>'
        : interactionCards(data.regimen.interactions, list)}
    </section>`;
  }
  const unresolved = data.unresolved.length
    ? `<div class="unresolved" role="status"><strong>Tyto položky se nepodařilo rozpoznat, nebyly zkontrolovány:</strong>
        <ul>${data.unresolved.map(entry => `<li>${escape(entry.name)}${entry.message ? ` – ${escape(entry.message)}` : ''}${entry.candidates.length ? ` (možná: ${entry.candidates.map(escape).join(', ')})` : ''}</li>`).join('')}</ul></div>`
    : '';
  return `${unresolved}<section class="medicines-panel" aria-labelledby="medicine-interactions-title">
      <div class="panel-head"><h3 id="medicine-interactions-title">Léčiva pacienta</h3><p>Interakce mezi léčivy v seznamu.</p></div>
      ${medicines}</section>${regimen}`;
}

function interactionsView(list) {
  const entry = interactions.get(list.id);
  let body = '';
  if (entry?.status === 'loading') {
    body = '<p class="interactions-status"><span class="spinner" aria-hidden="true"></span> Načítám interakce…</p>';
  } else if (entry?.status === 'error') {
    body = `<p class="field-error" role="alert">${escape(entry.error)}</p>`;
  } else if (entry?.status === 'done') {
    body = interactionResults(entry.data, list);
  }
  const busy = entry?.status === 'loading';
  // A loaded result is final until a change of substances clears it; a failed load can be retried.
  const canLoad = !busy && list.items.length && (!entry || entry.status === 'error');
  return `<section class="interactions" aria-labelledby="interactions-title" aria-live="polite">
    <div class="interactions-head"><h2 id="interactions-title">Interakce</h2>
      <button type="button" class="primary" data-action="interactions" ${canLoad ? '' : 'disabled'}>Načíst interakce</button></div>
    ${body}</section>`;
}

const regimenDrugsView = list => {
  const drugs = list.regimen ? regimenDrugs[list.regimen] || [] : [];
  if (!list.regimen) return '';
  return drugs.length
    ? `<div class="regimen-drugs"><span class="label">Látky v režimu</span>
        <ul>${drugs.map(drug => `<li>${escape(drug)}</li>`).join('')}</ul></div>`
    : '<p class="regimen-drugs-none">Látky pro tento režim nejsou k dispozici.</p>';
};

function regimenRow(list) {
  return `<div class="regimen-row"><label class="regimen-main"><span class="label">Režim onkologické léčby</span>
      <input class="cell-input regimen-input" data-field="regimen" value="${escape(list.regimen)}" maxlength="200"
        placeholder="Napište název režimu (volitelné)" autocomplete="off" spellcheck="false"></label>
    <div id="regimen-drugs-slot">${regimenDrugsView(list)}</div></div>`;
}

const substancesCell = item => item.substances?.length
  ? `<ul>${item.substances.map(name => `<li>${escape(name)}</li>`).join('')}</ul>` : '<span class="muted">—</span>';

// Table cells are borderless inputs: they read like plain text until hovered or focused.
function cellInput(item, field, label, attributes = {}) {
  const extra = Object.entries(attributes).map(([key, value]) => `${key}="${escape(value)}"`).join(' ');
  return `<input class="cell-input" data-id="${escape(item.id)}" data-field="${field}" value="${escape(item[field] || '')}"
    aria-label="${escape(label)}" placeholder="—" autocomplete="off" spellcheck="false" ${extra}>`;
}

function listView(list) {
  return `<div class="list-head"><div id="pin-entry"></div></div>
    <section class="patient-record" aria-label="Seznam pacienta">
      <div class="record-heading">
        <strong class="record-pin">PIN ${escape(list.pin)}</strong>
        <p class="upload-info">Nahráno pacientem ${list.sentAt ? `<time datetime="${escape(list.sentAt)}">${escape(date(list.sentAt))} v ${escape(time(list.sentAt))}</time>` : '· čas nahrání není dostupný'}</p>
        <button type="button" class="icon-button close-list" data-action="close-list" aria-label="Zavřít aktuální seznam" title="Zavřít aktuální seznam">${icon('close')}</button>
      </div>
    ${regimenRow(list)}
    ${list.items.length ? `<div class="table-wrap"><table class="med-table"><thead><tr>
        <th>Léčivo</th><th>Síla / dávkování</th><th>Kdy</th><th>Léčivé látky</th><th><span class="sr-only">Akce</span></th></tr></thead><tbody>
      ${list.items.map(item => `<tr>
        <td class="c-name">${cellInput(item, 'name', 'Název léčiva', { maxlength: 120 })}</td>
        <td>${cellInput(item, 'dosage', 'Síla / dávkování', { maxlength: 120 })}</td>
        <td>${cellInput(item, 'schedule', 'Kdy užívat', { maxlength: 120 })}</td>
        <td class="substances">${substancesCell(item)}</td>
        <td class="actions"><button type="button" class="icon-button" data-action="delete-item" data-id="${escape(item.id)}" aria-label="Odstranit ${escape(item.name || 'léčivo')}">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>`
      : `<div class="doc-empty">${icon('list')}<strong>Seznam je prázdný</strong>Přidejte léčivo ručně.</div>`}
    <div class="table-actions"><button type="button" class="small-button" data-action="add-item">${icon('plus')} Přidat léčivo</button>
      <span class="copy-group"><button type="button" class="small-button" data-action="copy-lines" ${list.items.length ? '' : 'disabled'}>${icon('copy')} <span>Kopírovat v tabulce</span></button>
      <button type="button" class="small-button" data-action="copy-inline" ${list.items.length ? '' : 'disabled'}>${icon('copy')} <span>Kopírovat do řádku</span></button></span></div>
    </section>
    <div id="interactions-slot">${interactionsView(list)}</div>`;
}

function render() {
  const pinForm = $('#pin-form');
  const list = currentList();
  $('#main').innerHTML = list ? listView(list)
    : '<div class="list-head"><div id="pin-entry"></div></div>';
  // Move the existing form to preserve its listeners, value and loading/error state.
  $('#pin-entry').append(pinForm);
  document.title = `${list ? `PIN ${list.pin}` : 'Lékař'} · PillGaze`;
  document.querySelectorAll('.cell-input[data-field="name"]').forEach(input => medicineNames.bind(input));
  document.querySelectorAll('.regimen-input').forEach(input => regimenNames.bind(input));
}

// Only the interactions block is redrawn, so a cell the doctor is typing in keeps its focus.
function renderInteractions(list) {
  const slot = $('#interactions-slot');
  if (slot && currentList()?.id === list.id) slot.innerHTML = interactionsView(list);
}

async function runInteractions(list) {
  if (interactions.get(list.id)?.status === 'loading') return;
  regimenDrugs = await loadRegimenDrugs(); // the regimen's drugs are part of the signature below
  if (currentList()?.id !== list.id) return;
  const token = newId();
  const controller = new AbortController();
  const signature = interactionSignature(list);
  interactions.set(list.id, { status: 'loading', token, signature, controller });
  renderInteractions(list);
  try {
    const data = await fetchInteractions(structuredClone(list.items), list.regimen ? regimenOf(list) : null, { signal: controller.signal });
    if (interactions.get(list.id)?.token !== token) return; // cleared by an edit meanwhile
    interactions.set(list.id, { status: 'done', data, token, signature });
  } catch (error) {
    if (interactions.get(list.id)?.token !== token) return;
    interactions.set(list.id, { status: 'error', error: error.message || 'Interakce se nepodařilo načíst.', token, signature });
  }
  renderInteractions(list);
}

function afterEdit(list, { redraw = true } = {}) {
  touch(list);
  // Changed substances invalidate the loaded interactions: clear them (this also drops a request in flight).
  if (interactions.get(list.id) && interactions.get(list.id).signature !== interactionSignature(list)) clearInteractions(list);
  if (redraw) render();
  else {
    renderInteractions(list);
  }
}

// The engine runs a few agents at a time, so requests go through a small queue instead of all at once.
const MAX_PARALLEL_RESEARCH = 3;
const researchQueue = [];
let researchActive = 0;

function pumpResearch() {
  while (researchActive < MAX_PARALLEL_RESEARCH && researchQueue.length) {
    const job = researchQueue.shift();
    if (research.get(job.key)?.controller !== job.controller) continue; // cleared while waiting
    researchActive++;
    research.set(job.key, { status: 'loading', controller: job.controller });
    renderDetails();
    researchInteraction(job.names, job.site, { signal: job.controller.signal })
      .then(data => ({ status: 'done', data }), error => ({ status: 'error', error: error.message || 'Hledání se nepodařilo.' }))
      .then(result => {
        researchActive--;
        if (research.get(job.key)?.controller === job.controller) research.set(job.key, { ...result, controller: job.controller });
        renderDetails();
        pumpResearch();
      });
  }
}

// Starts every site that has no result yet (finished and running ones are left alone).
function runResearch(list, names, sites = RESEARCH_SITES) {
  for (const site of sites) {
    const key = researchKey(list, names, site);
    const status = research.get(key)?.status;
    if (status === 'loading' || status === 'queued' || status === 'done') continue;
    const controller = new AbortController();
    research.set(key, { status: 'queued', controller });
    researchQueue.push({ key, names, site, controller });
  }
  renderDetails();
  pumpResearch();
}

// Drops loaded interactions and the web research that belongs to them, aborting requests in flight.
function clearInteractions(list) {
  if (detailsTarget?.list.id === list.id) detailsDialog.close();
  interactions.get(list.id)?.controller?.abort();
  interactions.delete(list.id);
  for (const [key, entry] of research) {
    if (!key.startsWith(`${list.id}|`)) continue;
    entry.controller?.abort();
    research.delete(key);
  }
}

// --- PIN entry ---
const pinInput = $('#pin');
pinInput.addEventListener('input', () => {
  pinInput.value = normalizePin(pinInput.value).slice(0, 6);
  $('#pin-error').textContent = '';
  pinInput.removeAttribute('aria-invalid');
});

$('#pin-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (loading) return;
  const pin = normalizePin(pinInput.value);
  if (!isPin(pin)) {
    $('#pin-error').textContent = 'PIN má 6 znaků (písmena A–Z a číslice 0–9).';
    pinInput.setAttribute('aria-invalid', 'true');
    return;
  }
  loading = true;
  const request = ++pinRequest;
  $('#pin-submit').disabled = true;
  $('#pin-submit').textContent = 'Načítám…';
  try {
    const received = await fetchListByPin(pin);
    if (request !== pinRequest) return;
    const nextState = createDoctorState();
    const list = addList(nextState, { pin, items: received.items, regimen: received.regimen, sentAt: received.sentAt });
    applySubstances(list.items, await loadSuklSubstances());
    if (request !== pinRequest) return;
    state = nextState;
    pinInput.value = pin;
    render();
  } catch (error) {
    if (request !== pinRequest) return;
    $('#pin-error').textContent = error.message || 'Seznam se nepodařilo načíst.';
    pinInput.setAttribute('aria-invalid', 'true');
  } finally {
    if (request === pinRequest) {
      loading = false;
      $('#pin-submit').disabled = false;
      $('#pin-submit').textContent = 'Zobrazit';
      pinInput.focus();
    }
  }
});

// A shared doctor link can carry the patient's PIN in the query string.
// Load it through the same form flow so errors are shown in the usual place.
const sharedPin = new URLSearchParams(location.search).get('pin');
if (sharedPin) {
  pinInput.value = normalizePin(sharedPin).slice(0, 6);
  $('#pin-form').requestSubmit();
}

// --- Supporting catalogues ---
void loadRegimenDrugs().then(drugs => { regimenDrugs = drugs; render(); });
// Fill missing substances on the currently open list when the catalogue arrives.
void loadSuklSubstances().then(map => {
  if (!currentList() || !applySubstances(currentList().items, map)) return;
  render();
});

const regimenNames = createAutocomplete({ getOptions: loadRegimens, id: 'regimen-suggestions', minWidth: 320 });
const medicineNames = createAutocomplete({ getOptions: loadSuklNames, id: 'medicine-suggestions', minWidth: 320 });
let armedDelete = null;

$('#main').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const list = currentList();
  if (!button || !list) return;
  switch (button.dataset.action) {
    case 'close-list': {
      ++pinRequest; // An older PIN request must not reopen the dismissed list.
      loading = false;
      for (const entry of interactions.values()) entry.controller?.abort();
      for (const entry of research.values()) entry.controller?.abort();
      interactions.clear();
      research.clear();
      researchQueue.length = 0;
      detailRows.clear();
      detailsTarget = null;
      if (detailsDialog.open) detailsDialog.close();
      state = createDoctorState();
      disarmDelete();
      pinInput.value = '';
      pinInput.removeAttribute('aria-invalid');
      $('#pin-error').textContent = '';
      $('#pin-submit').disabled = false;
      $('#pin-submit').textContent = 'Zobrazit';
      const url = new URL(location.href);
      url.searchParams.delete('pin');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      render();
      pinInput.focus();
      break;
    }
    case 'add-item': {
      const item = { id: newId(), name: '', dosage: '', dosesPerPackage: '' };
      list.items.push(item);
      afterEdit(list);
      document.querySelector(`.cell-input[data-id="${item.id}"][data-field="name"]`)?.focus();
      break;
    }
    case 'delete-item':
      // Two clicks: the first arms the button, the second removes the row.
      if (armedDelete !== button) {
        armedDelete = button;
        button.classList.add('armed');
        button.setAttribute('aria-label', 'Potvrdit odstranění');
        setTimeout(() => { if (armedDelete === button) disarmDelete(); }, 3000);
        break;
      }
      armedDelete = null;
      list.items = list.items.filter(item => item.id !== button.dataset.id);
      afterEdit(list);
      break;
    case 'interactions': if (!button.disabled) void runInteractions(list); break;
    case 'details': {
      const row = detailRows.get(button.dataset.key);
      if (!row) break;
      detailsTarget = { list, row };
      $('#details-title').textContent = `${row.a} + ${row.b}`;
      detailsDialog.showModal();
      runResearch(list, row.names);
      renderDetails();
      break;
    }
    case 'copy-lines': void copyText(button, formatMedicineLines(list.items)); break;
    case 'copy-inline': void copyText(button, formatMedicineInline(list.items)); break;
  }
});

async function copyText(button, text) {
  const label = button.querySelector('span');
  const original = label.textContent;
  let copied = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs HTTPS or localhost; fall back for plain-HTTP access.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    copied = document.execCommand('copy');
    area.remove();
  }
  label.textContent = copied ? 'Zkopírováno' : 'Kopírování se nezdařilo';
  setTimeout(() => { if (label.isConnected) label.textContent = original; }, 2000);
}

function disarmDelete() {
  armedDelete?.classList.remove('armed');
  armedDelete?.setAttribute('aria-label', 'Odstranit léčivo');
  armedDelete = null;
}
$('#main').addEventListener('focusout', event => {
  if (event.target === armedDelete) disarmDelete();
});

// Cells commit on change (blur or Enter); an invalid value stays visible and marked, the data is untouched.
$('#main').addEventListener('change', async event => {
  const input = event.target.closest('.cell-input');
  const list = currentList();
  if (input?.dataset.field === 'regimen' && list) {
    const regimen = input.value.trim().slice(0, 200);
    if (regimen === list.regimen) return;
    list.regimen = regimen;
    $('#regimen-drugs-slot').innerHTML = regimenDrugsView(list);
    afterEdit(list, { redraw: false });
    return;
  }
  const item = list?.items.find(entry => entry.id === input?.dataset.id);
  if (!item) return;
  const field = input.dataset.field;
  const value = input.value.trim();
  const error = validateItem({ ...item, [field]: value })[field];
  if (error) {
    input.setAttribute('aria-invalid', 'true');
    input.title = error;
    return;
  }
  input.removeAttribute('aria-invalid');
  input.removeAttribute('title');
  if (value === (item[field] || '')) return;
  if (field === 'schedule' && !value) delete item.schedule;
  else item[field] = value;
  if (field === 'name') {
    // A new name means new active substances (or none, when the catalogue does not know it).
    applySubstances([item], await loadSuklSubstances(), { replace: true });
    const cell = input.closest('tr')?.querySelector('.substances');
    if (cell) cell.innerHTML = substancesCell(item);
  }
  afterEdit(list, { redraw: false });
});

const detailsDialog = $('#details-dialog');
detailsDialog.addEventListener('close', () => { detailsTarget = null; });
$('#details-close').addEventListener('click', () => detailsDialog.close());
// The tooltip is `position: fixed` and placed by hand: an absolute one would stretch the dialog's
// scroll area and make the dialog jump when hovering the last pills.
function showPillTip(item) {
  const tip = item.querySelector('.pill-tip');
  const pill = item.querySelector('.site-pill');
  if (!tip || !pill) return;
  item.classList.add('tip-open');
  const rect = pill.getBoundingClientRect();
  tip.style.top = `${rect.bottom + 6}px`;
  tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8))}px`;
}
const hidePillTip = item => item.classList.remove('tip-open');
detailsDialog.addEventListener('mouseover', event => {
  const item = event.target.closest('.site-item');
  if (item) showPillTip(item);
});
detailsDialog.addEventListener('mouseout', event => {
  const item = event.target.closest('.site-item');
  if (item && !item.contains(event.relatedTarget)) hidePillTip(item);
});
detailsDialog.addEventListener('focusin', event => {
  const item = event.target.closest('.site-item');
  if (item) showPillTip(item);
});
detailsDialog.addEventListener('focusout', event => {
  const item = event.target.closest('.site-item');
  if (item) hidePillTip(item);
});

detailsDialog.addEventListener('click', event => {
  const retry = event.target.closest('[data-action="research-site"]');
  if (retry && detailsTarget) runResearch(detailsTarget.list, detailsTarget.row.names, [retry.dataset.site]);
});

$('#main').addEventListener('keydown', event => {
  const input = event.target.closest('.cell-input');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    input.blur();
  } else if (event.key === 'Escape') {
    const list = currentList();
    input.value = input.dataset.field === 'regimen'
      ? list?.regimen || ''
      : list?.items.find(entry => entry.id === input.dataset.id)?.[input.dataset.field] || '';
    input.removeAttribute('aria-invalid');
    input.removeAttribute('title');
    input.blur();
  }
});

render();
