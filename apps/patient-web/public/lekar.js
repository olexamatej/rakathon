import { newId } from './lists.js';
import {
  createDoctorState, loadDoctorState, saveDoctorState, addList, touch, validateItem,
  normalizePin, isPin, formatMedicineLines, formatMedicineInline,
} from './doctor.js';
import { fetchListByPin, fetchInteractions, loadRegimenDrugs, loadSuklNames } from './doctor-services.js';
import { loadRegimens } from './services.js';
import { createAutocomplete } from './autocomplete.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const date = value => new Intl.DateTimeFormat('cs', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('cs', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const itemCount = count => `${count} ${count === 1 ? 'léčivo' : count > 1 && count < 5 ? 'léčiva' : 'léčiv'}`;
const icons = {
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

let state = createDoctorState();
let loadFailed = false;
let loading = false;
let regimenDrugs = {}; // regimen name -> drug names, filled asynchronously
const interactions = new Map(); // list id -> { status, data, error, token }

try {
  state = loadDoctorState(localStorage);
} catch (error) {
  loadFailed = true;
  showNotice(`${error.message} Uložená historie zůstala beze změny a nové seznamy se neukládají.`);
}

function showNotice(text) {
  const notice = $('#storage-notice');
  notice.textContent = text;
  notice.hidden = !text;
}

function persist() {
  if (loadFailed) return;
  try {
    saveDoctorState(localStorage, state);
    showNotice('');
  } catch {
    showNotice('Změny se nepodařilo uložit do prohlížeče. Nezavírejte stránku.');
  }
}

const currentList = () => state.lists.find(list => list.id === decodeURIComponent(location.hash.slice(1)));

function historyView(current) {
  if (!state.lists.length) return '<p class="history-empty">Zatím žádné seznamy.</p>';
  return state.lists.map(list => `<button type="button" class="history-item" data-action="open" data-id="${escape(list.id)}" ${list.id === current?.id ? 'aria-current="true"' : ''}>
      <code>${escape(list.pin)}</code>
      <small>${escape(date(list.loadedAt))} ${escape(time(list.loadedAt))} · ${itemCount(list.items.length)}${list.regimen ? ` · ${escape(list.regimen)}` : ''}</small>
    </button>`).join('');
}

const regimenOf = list => ({ name: list.regimen, drugs: regimenDrugs[list.regimen] || [] });

const SEVERITY = {
  high: { label: 'Závažná', icon: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17.5v.01"/>' },
  moderate: { label: 'Střední', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.01"/>' },
  low: { label: 'Mírná', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>' },
  unknown: { label: 'Neznámá', icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01"/>' },
};
const severityRank = row => Object.keys(SEVERITY).indexOf(row.severity);

function interactionCard(row) {
  const severity = SEVERITY[row.severity] || SEVERITY.unknown;
  const links = (row.links || []).filter(link => /^https:\/\//.test(link.url));
  return `<article class="interaction-card sev-${row.severity in SEVERITY ? row.severity : 'unknown'}">
    <span class="sev-icon" title="${escape(severity.label)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${severity.icon}</svg><span class="sr-only">Závažnost: ${escape(severity.label)}</span></span>
    <div class="interaction-body">
      <p class="pair"><strong>${escape(row.a)}</strong><span aria-hidden="true">+</span><span class="sr-only">a</span><strong>${escape(row.b)}</strong></p>
      <p class="summary">${escape(row.summary)}</p>
    </div>
    ${links.length ? `<ul class="interaction-links" aria-label="Další informace">${links.map(link => `<li><a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${escape(link.title)} ↗</a>${link.description ? `<p>${escape(link.description)}</p>` : ''}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function interactionCards(rows) {
  if (!rows.length) return '<p class="muted">Žádné interakce.</p>';
  return `<div class="card-grid">${[...rows].sort((x, y) => severityRank(x) - severityRank(y)).map(interactionCard).join('')}</div>`;
}

function interactionResults(data, list) {
  const medicines = list.items.length > 1
    ? interactionCards(data.medicines)
    : '<p class="muted">Není co porovnávat – seznam obsahuje méně než dvě léčiva.</p>';
  let regimen = '';
  if (data.regimen) {
    const drugs = regimenDrugs[data.regimen.name] || [];
    regimen = `<section class="regimen-panel" aria-labelledby="regimen-interactions-title">
      <div class="panel-head"><h3 id="regimen-interactions-title">Onkologický režim <span>${escape(data.regimen.name)}</span></h3>
        <p>Interakce látek režimu s léčivy pacienta.</p></div>
      ${!drugs.length ? '<p class="muted">Pro tento režim nejsou k dispozici látky, interakce nelze načíst.</p>'
        : !list.items.length ? '<p class="muted">Seznam neobsahuje žádná léčiva k porovnání.</p>'
        : interactionCards(data.regimen.interactions)}
    </section>`;
  }
  return `<section class="medicines-panel" aria-labelledby="medicine-interactions-title">
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
  return `<section class="interactions" aria-labelledby="interactions-title" aria-live="polite">
    <div class="interactions-head"><h2 id="interactions-title">Interakce</h2>
      <button type="button" class="primary" data-action="interactions" ${busy || !list.items.length ? 'disabled' : ''}>${entry?.status === 'done' ? 'Načíst znovu' : 'Načíst interakce'}</button>
      ${entry?.status === 'done' ? `<small>Načteno v ${escape(time(entry.data.checkedAt))}</small>` : ''}</div>
    ${body}</section>`;
}

function regimenRow(list) {
  const drugs = list.regimen ? regimenDrugs[list.regimen] || [] : [];
  return `<div class="regimen-row"><div class="regimen-main"><span class="label">Režim onkologické léčby</span>
      ${list.regimen ? `<strong>${escape(list.regimen)}</strong>` : '<span class="none">neuveden</span>'}
      <button type="button" class="secondary" data-action="edit-regimen">${list.regimen ? 'Upravit' : 'Přidat'}</button></div>
    ${list.regimen ? (drugs.length
      ? `<div class="regimen-drugs"><span class="label">Látky v režimu</span>
          <ul>${drugs.map(drug => `<li>${escape(drug)}</li>`).join('')}</ul></div>`
      : '<p class="regimen-drugs-none">Látky pro tento režim nejsou k dispozici.</p>') : ''}</div>`;
}

// Table cells are borderless inputs: they read like plain text until hovered or focused.
function cellInput(item, field, label, attributes = {}) {
  const extra = Object.entries(attributes).map(([key, value]) => `${key}="${escape(value)}"`).join(' ');
  return `<input class="cell-input" data-id="${escape(item.id)}" data-field="${field}" value="${escape(item[field] || '')}"
    aria-label="${escape(label)}" placeholder="—" autocomplete="off" spellcheck="false" ${extra}>`;
}

function listView(list) {
  return `<div class="list-head"><h1>Seznam léčiv</h1>
      <p>PIN <code>${escape(list.pin)}</code> · odesláno ${escape(date(list.sentAt || list.loadedAt))} v ${escape(time(list.sentAt || list.loadedAt))} · ${itemCount(list.items.length)}</p></div>
    ${regimenRow(list)}
    ${list.items.length ? `<div class="table-wrap"><table class="med-table"><thead><tr>
        <th>Léčivo</th><th>Síla / dávkování</th><th>Kdy</th><th>Léčivé látky</th><th><span class="sr-only">Akce</span></th></tr></thead><tbody>
      ${list.items.map(item => `<tr>
        <td class="c-name">${cellInput(item, 'name', 'Název léčiva', { maxlength: 120 })}</td>
        <td>${cellInput(item, 'dosage', 'Síla / dávkování', { maxlength: 120 })}</td>
        <td>${cellInput(item, 'schedule', 'Kdy užívat', { maxlength: 20 })}</td>
        <td class="substances">${item.substances?.length ? `<ul>${item.substances.map(name => `<li>${escape(name)}</li>`).join('')}</ul>` : '<span class="muted">—</span>'}</td>
        <td class="actions"><button type="button" class="icon-button" data-action="delete-item" data-id="${escape(item.id)}" aria-label="Odstranit ${escape(item.name || 'léčivo')}">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>`
      : `<div class="doc-empty">${icon('list')}<strong>Seznam je prázdný</strong>Přidejte léčivo ručně.</div>`}
    <div class="table-actions"><button type="button" class="small-button" data-action="add-item">${icon('plus')} Přidat léčivo</button>
      <span class="copy-group"><button type="button" class="small-button" data-action="copy-lines" ${list.items.length ? '' : 'disabled'}>${icon('copy')} <span>Kopírovat po řádcích</span></button>
      <button type="button" class="small-button" data-action="copy-inline" ${list.items.length ? '' : 'disabled'}>${icon('copy')} <span>Kopírovat do řádku</span></button></span></div>
    <div id="interactions-slot">${interactionsView(list)}</div>`;
}

function render() {
  const list = currentList();
  $('#history').innerHTML = historyView(list);
  $('#main').innerHTML = list ? listView(list)
    : `<div class="doc-empty">${icon('list')}<strong>Zadejte PIN pacienta</strong>Seznam léčiv se zobrazí zde.</div>`;
  document.title = `${list ? `PIN ${list.pin}` : 'Lékař'} · PillGaze`;
  document.querySelectorAll('.cell-input[data-field="name"]').forEach(input => medicineNames.bind(input));
}

// Only the interactions block is redrawn, so a cell the doctor is typing in keeps its focus.
function renderInteractions(list) {
  const slot = $('#interactions-slot');
  if (slot && currentList()?.id === list.id) slot.innerHTML = interactionsView(list);
}

async function runInteractions(list) {
  const token = newId();
  interactions.set(list.id, { status: 'loading', token });
  renderInteractions(list);
  try {
    const drugs = await loadRegimenDrugs();
    regimenDrugs = drugs;
    const data = await fetchInteractions(structuredClone(list.items), list.regimen ? regimenOf(list) : null);
    if (interactions.get(list.id)?.token !== token) return;
    interactions.set(list.id, { status: 'done', data, token });
  } catch (error) {
    if (interactions.get(list.id)?.token !== token) return;
    interactions.set(list.id, { status: 'error', error: error.message || 'Interakce se nepodařilo načíst.', token });
  }
  renderInteractions(list);
}

// After an edit the shown interactions are outdated; refetch when they were already requested.
function afterEdit(list, { redraw = true } = {}) {
  touch(list);
  persist();
  if (redraw) render();
  else $('#history').innerHTML = historyView(list);
  if (interactions.has(list.id)) void runInteractions(list);
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
  $('#pin-submit').disabled = true;
  $('#pin-submit').textContent = 'Načítám…';
  try {
    const received = await fetchListByPin(pin);
    const list = addList(state, { pin, items: received.items, regimen: received.regimen, sentAt: received.sentAt });
    persist();
    pinInput.value = '';
    location.hash = encodeURIComponent(list.id);
    render();
  } catch (error) {
    $('#pin-error').textContent = error.message || 'Seznam se nepodařilo načíst.';
    pinInput.setAttribute('aria-invalid', 'true');
  } finally {
    loading = false;
    $('#pin-submit').disabled = false;
    $('#pin-submit').textContent = 'Zobrazit';
    pinInput.focus();
  }
});

// --- history and list actions ---
$('#history').addEventListener('click', event => {
  const button = event.target.closest('[data-action="open"]');
  if (button) location.hash = encodeURIComponent(button.dataset.id);
});

window.addEventListener('hashchange', render);
void loadRegimenDrugs().then(drugs => { regimenDrugs = drugs; render(); });

const regimenDialog = $('#regimen-dialog');
const medicineNames = createAutocomplete({ getOptions: loadSuklNames, id: 'medicine-suggestions', minWidth: 320 });
let armedDelete = null;

$('#main').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const list = currentList();
  if (!button || !list) return;
  switch (button.dataset.action) {
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
    case 'edit-regimen':
      $('#regimen-input').value = list.regimen;
      regimenDialog.showModal();
      break;
    case 'interactions': void runInteractions(list); break;
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
$('#main').addEventListener('change', event => {
  const input = event.target.closest('.cell-input');
  const list = currentList();
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
  afterEdit(list, { redraw: false });
});

$('#main').addEventListener('keydown', event => {
  const input = event.target.closest('.cell-input');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    input.blur();
  } else if (event.key === 'Escape') {
    const item = currentList()?.items.find(entry => entry.id === input.dataset.id);
    input.value = item?.[input.dataset.field] || '';
    input.removeAttribute('aria-invalid');
    input.removeAttribute('title');
    input.blur();
  }
});

createAutocomplete({ getOptions: loadRegimens, container: regimenDialog, id: 'regimen-suggestions' }).bind($('#regimen-input'));
$('#regimen-cancel').addEventListener('click', () => regimenDialog.close());
$('#regimen-form').addEventListener('submit', event => {
  event.preventDefault();
  const list = currentList();
  if (!list) return regimenDialog.close();
  const regimen = $('#regimen-input').value.trim().slice(0, 200);
  regimenDialog.close();
  if (regimen === list.regimen) return;
  list.regimen = regimen;
  afterEdit(list);
});

render();
