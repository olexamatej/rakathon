import { createState, loadState, saveState, recordSubmission, updateSubmission, canSend, medicineSummary } from './lists.js';
import { recognizePhoto, sendList, loadRegimens } from './services.js';

const app = document.querySelector('#app');
const photos = [];
let state = createState();
let unsaved = false;
let processing = false;
let sending = false;
let loadFailed = false;
let storageWarning = '';
let message = '';
let regimenOpen = false;
let installPrompt;
let historyLimit = 10;

try {
  const loaded = loadState(localStorage);
  state = loaded.state;
  if (loaded.skipped) storageWarning = 'Některá starší data nelze načíst. Původní záznamy zůstaly zachované.';
} catch {
  loadFailed = true;
  storageWarning = 'Uložený seznam nelze načíst. Původní data zůstala zachovaná. Zkuste stránku obnovit.';
}

// A fresh visit (including a reload of the editor) always returns to the latest saved PIN.
if (state.submissions.length) {
  history.replaceState(null, '', `/pacient?pin=${encodeURIComponent(state.submissions[0].id)}`);
}

function editingSubmission() {
  const id = new URLSearchParams(location.search).get('edit');
  return state.submissions.find(entry => entry.id === id);
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const icons = {
  arrow: '<path d="m9 5 7 7-7 7"/>',
  camera: '<path d="M4 6h4l2-3h4l2 3h4v14H4z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const itemCount = count => `${count} ${count === 1 ? 'léčivo' : count > 1 && count < 5 ? 'léčiva' : 'léčiv'}`;
const isBusy = () => loadFailed || processing || sending;

function persist() {
  if (loadFailed) return;
  try {
    saveState(localStorage, state);
    unsaved = false;
  } catch {
    unsaved = true;
  }
}

function navigate(query = '') {
  history.pushState(null, '', `/pacient${query}`);
  message = '';
  render(true);
}

function saveStatus() {
  return unsaved
    ? '<span class="save-error">Změny nejsou uložené. Nezavírejte aplikaci.</span><button class="text-button" data-action="retry-save">Zkusit znovu</button>'
    : '';
}

function photoRows() {
  if (!photos.length) return '';
  return `<ul class="photo-jobs" aria-label="Zpracování fotografií" aria-live="polite">${photos.map(job => `
    <li class="photo-job ${job.status === 'error' ? 'photo-error' : ''}">
      ${job.url ? `<img src="${escape(job.url)}" alt="Přidaná fotografie" width="44" height="44">` : icon('image')}
      <span><strong>${escape(job.name)}</strong><span>${escape(job.status === 'done' ? `Hotovo · ${itemCount(job.count)}` : job.status === 'error' ? job.error : job.status === 'processing' ? 'Zpracovávám fotografii…' : 'Čeká na zpracování…')}</span></span>
      ${job.status === 'done' ? icon('check') : job.status === 'processing' ? '<span class="spinner" aria-hidden="true"></span>' : ''}
    </li>`).join('')}</ul>`;
}

function editor() {
  const busy = isBusy();
  return `<h1 id="medicines-title" class="sr-only">Seznam léčiv</h1>
    <form id="list-form"><section class="medicines" aria-labelledby="medicines-title">
      ${state.items.length ? `<fieldset ${busy ? 'disabled' : ''}>
        <legend class="list-heading">Léčiva v seznamu <span>${itemCount(state.items.length)}</span></legend>${state.items.map((item, index) => `
        <article class="medicine"><div class="medicine-info">
          ${editingSubmission() ? `
          <label>Název léčiva<input data-id="${escape(item.id)}" data-field="name" value="${escape(item.name)}" maxlength="120" required></label>
          <label>Síla / dávkování<input data-id="${escape(item.id)}" data-field="dosage" value="${escape(item.dosage)}" maxlength="120"></label>
          <label>Kdy užívat<input data-id="${escape(item.id)}" data-field="schedule" value="${escape(item.schedule || '')}" maxlength="120"></label>
          <label>Počet dávek v balení<input data-id="${escape(item.id)}" data-field="dosesPerPackage" value="${escape(item.dosesPerPackage)}" maxlength="6" inputmode="numeric" pattern="[1-9][0-9]{0,5}"></label>`
          : `<strong>${escape(item.name || 'Nečitelný název léčiva')}</strong><span>${escape(medicineSummary(item))}</span>`}</div>
          <button type="button" class="icon-button" data-action="remove" data-id="${escape(item.id)}" aria-label="Odstranit léčivo ${escape(item.name)}">${icon('trash')}</button>
        </article>`).join('')}</fieldset>`
      : `<div class="empty-list">${icon('list')}<strong>Seznam je prázdný</strong></div>`}
    </section>
    ${state.regimen || regimenOpen ? `<section class="regimen-section"><label for="regimen" class="sr-only">Režim onkologické léčby (volitelné)</label>
      <div class="combo"><input id="regimen" name="regimen" value="${escape(state.regimen || '')}" maxlength="200" placeholder="Režim onkologické léčby (volitelné)" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="regimen-list" aria-autocomplete="list" ${busy ? 'disabled' : ''}>
      <button type="button" class="icon-button" data-action="remove-regimen" aria-label="Odebrat režim" ${busy ? 'disabled' : ''}>${icon('close')}</button>
      <ul id="regimen-list" role="listbox" aria-label="Návrhy režimů" hidden></ul></div></section>`
      : `<button type="button" class="add-link" data-action="add-regimen" ${busy ? 'disabled' : ''}>${icon('plus')} Přidat režim onkologické léčby</button>`}
    <section class="photo-section" aria-labelledby="photo-title"><div class="section-heading"><h2 id="photo-title">Přidejte fotografie</h2></div>
      <p>Z fotografie přepíšeme názvy léčiv a uvedené dávkování. Po zpracování seznam zkontrolujte.</p>
      <div class="photo-actions"><button type="button" class="secondary" data-action="gallery" ${busy ? 'disabled' : ''}>${icon('image')} Z galerie</button>
        <button type="button" class="secondary" data-action="camera" ${busy ? 'disabled' : ''}>${icon('camera')} Vyfotit</button></div>
      <input type="file" id="camera" accept="image/*" capture="environment" hidden ${busy ? 'disabled' : ''}>
      <input type="file" id="gallery" accept="image/*" multiple hidden ${busy ? 'disabled' : ''}>
      ${photoRows()}
    </section>
    <div class="send-panel"><button type="submit" id="send" class="primary full" ${!canSend(state.items) || busy ? 'disabled' : ''}>
      ${sending ? '<span class="spinner" aria-hidden="true"></span> Ukládám…' : 'Uložit seznam ' + icon('arrow')}</button>
      <p id="send-hint">${sendHint()}</p></div></form>`;
}

function sendHint() {
  if (processing || !state.items.length || canSend(state.items)) return '';
  return 'Některá léčiva jsou neúplná. Odstraňte je a přidejte znovu.';
}

function render(focus = false) {
  const params = new URLSearchParams(location.search);
  const requestedId = params.get('pin') || (!params.has('edit') && !params.has('new') ? state.submissions[0]?.id : null);
  const receipt = state.submissions.find(entry => entry.id === requestedId);
  if (receipt && !processing) {
    photos.splice(0).forEach(job => { if (job.url) URL.revokeObjectURL(job.url); });
  }
  const formatDate = value => new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
  const visibleHistory = state.submissions.slice(0, historyLimit);
  if (receipt && !visibleHistory.some(entry => entry.id === receipt.id)) visibleHistory.push(receipt);
  const history = state.submissions.length ? `<section class="submission-history" aria-labelledby="history-title">
    <h2 id="history-title">Historie uložených seznamů</h2>
    <p>Platnost starších PINů aplikace neověřuje.</p>
    <ul>${visibleHistory.map(entry => `<li><details ${entry.id === receipt?.id ? 'open' : ''}>
      <summary><code>${escape(entry.pin)}</code><time datetime="${escape(entry.sentAt)}">${escape(formatDate(entry.sentAt))}</time></summary>
      <ul class="history-items">${entry.items.map(item => `<li><strong>${escape(item.name || 'Nečitelný název léčiva')}</strong><span>${escape(medicineSummary(item))}</span></li>`).join('')}
      ${entry.regimen ? `<li><strong>Režim onkologické léčby</strong><span>${escape(entry.regimen)}</span></li>` : ''}</ul>
    </details></li>`).join('')}</ul>
    ${state.submissions.length > visibleHistory.length ? '<button class="secondary full" data-action="more-history">Zobrazit starší záznamy</button>' : ''}</section>` : '';
  const content = receipt ? `<main id="main" class="pin-screen">
    <section class="current-submission"><p class="pin-caption">PIN pro lékaře</p>
    <h1 class="pin" aria-label="PIN ${escape(receipt.pin.split('').join(' '))}">${escape(receipt.pin)}</h1>
    <p class="generated-at">Vygenerováno ${escape(formatDate(receipt.sentAt))}</p>
    <button class="primary" data-action="edit-list" data-id="${escape(receipt.id)}">Upravit seznam ${icon('arrow')}</button></section>
    ${history}</main>`
    : editor();
  const header = `<header><a class="brand" href="/pacient" data-action="home"><img src="/icons/icon.svg" width="36" height="36" alt="">PillGaze</a>
    <button class="install-button" data-action="install" aria-label="Nainstalovat aplikaci">${icon('download')}</button></header>`;
  app.innerHTML = receipt ? `<div class="shell">${header}${content}</div>` : `<div class="shell">${header}
    <main id="main">
      ${storageWarning ? `<p class="notice" role="alert">${escape(storageWarning)}</p>` : ''}
      <p class="save-status" id="save-status" role="status">${saveStatus()}</p>
      ${content}<p class="message" role="status" id="message">${escape(message)}</p></main></div>`;
  document.title = `${receipt ? 'PIN' : 'Seznam'} · PillGaze`;
  if (focus) {
    app.querySelector('h1').tabIndex = -1;
    app.querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

async function addPhotos(files) {
  if (!files.length || isBusy()) return;
  const jobs = files.map(file => ({ file, name: file.name, status: 'waiting', url: null }));
  photos.push(...jobs);
  processing = true;
  render();
  for (const job of jobs) {
    job.status = 'processing';
    render();
    try {
      if (!job.file.type.startsWith('image/')) throw new Error('Soubor není fotografie. Vyberte obrázek.');
      if (job.file.size > 20 * 1024 * 1024) throw new Error('Fotografie přesahuje 20 MB. Vyberte menší snímek.');
      job.url = URL.createObjectURL(job.file);
      const image = new Image();
      image.src = job.url;
      await image.decode().catch(() => { throw new Error('Fotku nelze přečíst. Zkuste JPEG, PNG nebo WebP.'); });
      render();
      const result = await recognizePhoto(job.file);
      const items = Array.isArray(result) ? result : result.items;
      const regimen = Array.isArray(result) ? '' : String(result.regimen || '').trim().slice(0, 200);
      job.count = items.length;
      state.items.push(...items);
      if (regimen && !state.regimen?.trim()) state.regimen = regimen;
      persist();
      job.status = 'done';
    } catch (error) {
      job.status = 'error';
      job.error = error.message || 'Fotografii se nepodařilo zpracovat. Přidejte ji prosím znovu.';
      if (job.url) URL.revokeObjectURL(job.url);
      job.url = null;
    } finally {
      delete job.file;
    }
  }
  processing = false;
  render();
}

const cameraDialog = document.querySelector('#camera-dialog');
const cameraVideo = document.querySelector('#camera-video');
let cameraStream = null;

function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}

// Stream the camera in-page everywhere: the native <input capture> app gets the browser OOM-killed on some phones
// (e.g. Galaxy S23), losing the photo. The file input is only a fallback when getUserMedia is unavailable or denied.
async function openCamera() {
  const input = document.getElementById('camera');
  if (!navigator.mediaDevices?.getUserMedia) return input.click();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
  } catch {
    return input.click();
  }
  cameraVideo.srcObject = cameraStream;
  cameraDialog.showModal();
}

cameraDialog.addEventListener('close', stopCamera);
document.querySelector('#camera-cancel').addEventListener('click', () => cameraDialog.close());
document.querySelector('#camera-shoot').addEventListener('click', () => {
  if (!cameraVideo.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
  cameraDialog.close();
  canvas.toBlob(blob => {
    if (blob) void addPhotos([new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
  }, 'image/jpeg', 0.9);
});

const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
let suggestions = [];
let activeSuggestion = -1;

function setActiveSuggestion(index) {
  const input = document.querySelector('#regimen');
  const options = document.querySelectorAll('#regimen-list [role="option"]');
  activeSuggestion = options.length ? (index + options.length) % options.length : -1;
  options.forEach((option, i) => option.setAttribute('aria-selected', String(i === activeSuggestion)));
  if (activeSuggestion >= 0) {
    input.setAttribute('aria-activedescendant', options[activeSuggestion].id);
    options[activeSuggestion].scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function hideSuggestions() {
  const list = document.querySelector('#regimen-list');
  if (!list) return;
  list.hidden = true;
  list.replaceChildren();
  suggestions = [];
  activeSuggestion = -1;
  document.querySelector('#regimen').setAttribute('aria-expanded', 'false');
  document.querySelector('#regimen').removeAttribute('aria-activedescendant');
}

async function showSuggestions() {
  const input = document.querySelector('#regimen');
  const query = normalize(input.value.trim());
  if (!query) return hideSuggestions();
  const names = await loadRegimens();
  if (document.querySelector('#regimen') !== input || normalize(input.value.trim()) !== query) return;
  const starts = [];
  const contains = [];
  for (const name of names) {
    const index = normalize(name).indexOf(query);
    if (index === 0) starts.push(name);
    else if (index > 0) contains.push(name);
    if (starts.length >= 30) break;
  }
  suggestions = [...starts, ...contains].slice(0, 30);
  if (!suggestions.length || (suggestions.length === 1 && suggestions[0] === input.value.trim())) return hideSuggestions();
  const list = document.querySelector('#regimen-list');
  list.replaceChildren(...suggestions.map((name, i) => {
    const option = document.createElement('li');
    option.id = `regimen-option-${i}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.textContent = name;
    option.dataset.name = name;
    return option;
  }));
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  activeSuggestion = -1;
}

function setRegimen(value) {
  state.regimen = value;
  persist();
  document.querySelector('#save-status').innerHTML = saveStatus();
}

function pickSuggestion(name) {
  document.querySelector('#regimen').value = name;
  setRegimen(name);
  hideSuggestions();
}

app.addEventListener('input', event => {
  if (isBusy()) return;
  if (event.target.dataset.field) {
    const item = state.items.find(item => item.id === event.target.dataset.id);
    if (!item) return;
    item[event.target.dataset.field] = event.target.value;
    persist();
    document.querySelector('#save-status').innerHTML = saveStatus();
    document.querySelector('#send').disabled = !canSend(state.items);
    document.querySelector('#send-hint').textContent = sendHint();
    return;
  }
  if (event.target.id !== 'regimen') return;
  setRegimen(event.target.value);
  void showSuggestions();
});

app.addEventListener('focusin', event => {
  if (event.target.id === 'regimen') void loadRegimens();
});

app.addEventListener('focusout', event => {
  if (event.target.id === 'regimen') hideSuggestions();
});

app.addEventListener('keydown', event => {
  if (event.target.id !== 'regimen') return;
  const open = !document.querySelector('#regimen-list').hidden;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!open) return void showSuggestions();
    event.preventDefault();
    setActiveSuggestion(activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter' && open && activeSuggestion >= 0) {
    event.preventDefault();
    pickSuggestion(suggestions[activeSuggestion]);
  } else if (event.key === 'Enter') {
    event.preventDefault();
  } else if (event.key === 'Escape' && open) {
    event.preventDefault();
    hideSuggestions();
  }
});

// mousedown keeps focus in the input, so the list is not hidden before the pick registers.
app.addEventListener('mousedown', event => {
  const option = event.target.closest('#regimen-list [role="option"]');
  if (!option) return;
  event.preventDefault();
  pickSuggestion(option.dataset.name);
});

app.addEventListener('change', event => {
  if (['camera', 'gallery'].includes(event.target.id)) {
    void addPhotos(Array.from(event.target.files || []));
  }
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  if (isBusy() || !canSend(state.items)) return;
  const items = structuredClone(state.items);
  const regimen = state.regimen || '';
  const origin = location.search;
  const editing = editingSubmission();
  sending = true;
  message = '';
  render();
  let entry;
  try {
    // Persist only the fields the doctor consumes; never upload local IDs or photo metadata.
    const receipt = await sendList({ items, regimen }, editing?.pin);
    entry = editing
      ? updateSubmission(state, editing.id, items, receipt, regimen)
      : recordSubmission(state, items, receipt, regimen);
    persist();
  } catch (error) {
    message = error.message || 'Odeslání se nezdařilo. Zkuste to znovu.';
  } finally {
    sending = false;
    if (entry && location.search === origin) navigate(`?pin=${encodeURIComponent(entry.id)}`);
    else render();
  }
});

app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  switch (button.dataset.action) {
    case 'home': navigate(); break;
    case 'camera': await openCamera(); break;
    case 'gallery': document.getElementById('gallery').click(); break;
    case 'add-regimen':
      regimenOpen = true;
      render();
      document.querySelector('#regimen')?.focus();
      break;
    case 'remove-regimen':
      if (isBusy()) break;
      state.regimen = '';
      regimenOpen = false;
      persist();
      render();
      break;
    case 'remove':
      if (isBusy()) break;
      state.items = state.items.filter(item => item.id !== button.dataset.id);
      persist();
      render();
      document.querySelector('#photo-title').tabIndex = -1;
      document.querySelector('#photo-title').focus({ preventScroll: true });
      break;
    case 'retry-save':
      persist();
      render();
      break;
    case 'edit-list': {
      if (isBusy()) break;
      const entry = state.submissions.find(entry => entry.id === button.dataset.id);
      if (!entry) break;
      state.items = structuredClone(entry.items);
      state.regimen = entry.regimen || '';
      regimenOpen = false;
      persist();
      navigate(`?edit=${encodeURIComponent(entry.id)}`);
      break;
    }
    case 'more-history':
      historyLimit += 10;
      render();
      break;
    case 'install':
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
      } else document.querySelector('#install-dialog').showModal();
      break;
  }
});

window.addEventListener('popstate', () => { message = ''; render(true); });
window.addEventListener('beforeunload', event => {
  if (unsaved || processing || sending) event.preventDefault();
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.getRegistrations().then(registrations =>
    Promise.all(registrations.map(registration => registration.unregister()))
  ).catch(() => {});
}
if ('caches' in window) {
  caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('pillgaze-patient-'))
    .map(key => caches.delete(key)))).catch(() => {});
}
persist();
render();
