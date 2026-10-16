import { newId } from './lists.js';
import {
  createDoctorState, loadDoctorState, saveDoctorState, addList, touch, validateItem,
  normalizePin, isPin, suklLink,
} from './doctor.js';
import { fetchListByPin, fetchInteractions, loadRegimenDrugs } from './doctor-services.js';
import { attachRegimenCombo } from './regimen-combo.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const date = value => new Intl.DateTimeFormat('cs', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('cs', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const itemCount = count => `${count} ${count === 1 ? 'léčivo' : count > 1 && count < 5 ? 'léčiva' : 'léčiv'}`;
const icons = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

let state = createDoctorState();
let loadFailed = false;
let loading = false;
let regimenDrugs = {}; // regimen name -> drug names, filled asynchronously
let drugsOpen = false;
let editing = null; // { list, item | null } while the item dialog is open
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

function suklCell(item) {
  const href = suklLink(item);
  if (!href) return '<span class="muted">—</span>';
  return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(item.suklCode || 'Detail')} ↗</a>`;
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
  return `<p class="placeholder-note">Zatím placeholder: interakce a odkazy jsou ukázkové, nejsou připojeny k reálným datům.</p>
    <section class="medicines-panel" aria-labelledby="medicine-interactions-title">
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
      ? `<details class="regimen-drugs" ${drugsOpen ? 'open' : ''}><summary>Látky v režimu <span>${drugs.length}</span></summary>
          <ul>${drugs.map(drug => `<li>${escape(drug)}</li>`).join('')}</ul></details>`
      : '<p class="regimen-drugs-none">Látky pro tento režim nejsou k dispozici.</p>') : ''}</div>`;
}

function listView(list) {
  return `<div class="list-head"><h1>Seznam léčiv</h1>
      <p>PIN <code>${escape(list.pin)}</code> · odesláno ${escape(date(list.sentAt || list.loadedAt))} v ${escape(time(list.sentAt || list.loadedAt))} · ${itemCount(list.items.length)}</p></div>
    ${regimenRow(list)}
    ${list.items.length ? `<div class="table-wrap"><table class="med-table"><thead><tr>
        <th>Léčivo</th><th>Síla / dávkování</th><th>Dávek v balení</th><th>Kdy</th><th>SÚKL</th><th><span class="sr-only">Akce</span></th></tr></thead><tbody>
      ${list.items.map(item => `<tr>
        <td class="name">${escape(item.name)}</td><td>${escape(item.dosage)}</td><td class="num">${escape(item.dosesPerPackage)}</td>
        <td>${item.schedule ? escape(item.schedule) : '<span class="muted">—</span>'}</td><td>${suklCell(item)}</td>
        <td class="actions"><button type="button" class="icon-button" data-action="edit-item" data-id="${escape(item.id)}" aria-label="Upravit ${escape(item.name)}">${icon('edit')}</button></td></tr>`).join('')}
      </tbody></table></div>`
      : `<div class="doc-empty">${icon('list')}<strong>Seznam je prázdný</strong>Přidejte léčivo ručně.</div>`}
    <div class="table-actions"><button type="button" class="small-button" data-action="add-item">${icon('plus')} Přidat léčivo</button></div>
    ${interactionsView(list)}`;
}

function render() {
  const list = currentList();
  $('#history').innerHTML = historyView(list);
  $('#main').innerHTML = list ? listView(list)
    : `<div class="doc-empty">${icon('list')}<strong>Zadejte PIN pacienta</strong>Seznam léčiv se zobrazí zde.</div>`;
  document.title = `${list ? `PIN ${list.pin}` : 'Lékař'} · PillGaze`;
}

async function runInteractions(list) {
  const token = newId();
  interactions.set(list.id, { status: 'loading', token });
  render();
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
  render();
}

// After an edit the shown interactions are outdated; refetch when they were already requested.
function afterEdit(list) {
  touch(list);
  persist();
  render();
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
// <details> does not bubble `toggle`, so listen in the capture phase to remember its state across renders.
$('#main').addEventListener('toggle', event => {
  if (event.target.classList?.contains('regimen-drugs')) drugsOpen = event.target.open;
}, true);
void loadRegimenDrugs().then(drugs => { regimenDrugs = drugs; render(); });

const itemDialog = $('#item-dialog');
const itemForm = $('#item-form');
const regimenDialog = $('#regimen-dialog');
let deleteArmed = false;

function openItemDialog(list, item) {
  editing = { list, item };
  deleteArmed = false;
  $('#item-dialog-title').textContent = item ? 'Upravit léčivo' : 'Přidat léčivo';
  $('#item-delete').hidden = !item;
  $('#item-delete').textContent = 'Odstranit';
  for (const field of ['name', 'dosage', 'dosesPerPackage', 'schedule', 'suklCode']) {
    itemForm.elements[field].value = item?.[field] || '';
    itemForm.elements[field].removeAttribute('aria-invalid');
  }
  itemForm.querySelectorAll('[data-error]').forEach(node => { node.textContent = ''; });
  itemDialog.showModal();
}

$('#main').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const list = currentList();
  if (!button || !list) return;
  switch (button.dataset.action) {
    case 'edit-item': openItemDialog(list, list.items.find(item => item.id === button.dataset.id)); break;
    case 'add-item': openItemDialog(list, null); break;
    case 'edit-regimen':
      $('#regimen-input').value = list.regimen;
      regimenDialog.showModal();
      break;
    case 'interactions': void runInteractions(list); break;
  }
});

itemForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!editing) return;
  const { list, item } = editing;
  const value = name => itemForm.elements[name].value.trim();
  const draft = {
    name: value('name'), dosage: value('dosage'), dosesPerPackage: value('dosesPerPackage'),
    schedule: value('schedule'), suklCode: value('suklCode'),
  };
  const errors = validateItem(draft);
  for (const field of ['name', 'dosage', 'dosesPerPackage', 'schedule', 'suklCode']) {
    itemForm.querySelector(`[data-error="${field}"]`).textContent = errors[field] || '';
    if (errors[field]) itemForm.elements[field].setAttribute('aria-invalid', 'true');
    else itemForm.elements[field].removeAttribute('aria-invalid');
  }
  const firstInvalid = Object.keys(errors)[0];
  if (firstInvalid) return itemForm.elements[firstInvalid].focus();
  const target = item || { id: newId() };
  const codeChanged = (target.suklCode || '') !== draft.suklCode;
  Object.assign(target, { name: draft.name, dosage: draft.dosage, dosesPerPackage: draft.dosesPerPackage });
  for (const field of ['schedule', 'suklCode']) {
    if (draft[field]) target[field] = draft[field];
    else delete target[field];
  }
  if (codeChanged) delete target.suklUrl; // the API link belonged to the previous code
  if (!item) list.items.push(target);
  editing = null;
  itemDialog.close();
  afterEdit(list);
});

$('#item-cancel').addEventListener('click', () => itemDialog.close());
itemDialog.addEventListener('close', () => { editing = null; });
$('#item-delete').addEventListener('click', event => {
  if (!editing?.item) return;
  if (!deleteArmed) {
    deleteArmed = true;
    event.target.textContent = 'Opravdu odstranit?';
    return;
  }
  const { list, item } = editing;
  list.items = list.items.filter(entry => entry.id !== item.id);
  editing = null;
  itemDialog.close();
  afterEdit(list);
});

attachRegimenCombo($('#regimen-input'), $('#regimen-suggestions'));
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
