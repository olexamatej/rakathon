import { STORAGE_KEY, createState, loadState, saveState, replaceSubmission, updateSubmission, invalidateSubmission, canSend, medicineSummary } from './lists.js';
import { recognizePhoto, sendList, savePatientList, validateList, renewPatientList, loadRegimens } from './services.js';

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
let checking = false;
let verifiedEntry;
let lastCheck = 0;
let editingSession = false;
let validityInfoOpen = false;
let localCopyInfoOpen = false;

try {
  const loaded = loadState(localStorage);
  state = loaded.state;
  if (loaded.skipped) storageWarning = 'Některá starší data nelze načíst. Původní záznamy zůstaly zachované.';
} catch {
  loadFailed = true;
  storageWarning = 'Uložený seznam nelze načíst. Původní data zůstala zachovaná. Zkuste stránku obnovit.';
}

// A fresh visit (including a reload of the editor) always returns to the latest saved PIN.
if (state.submissions.length && (!state.submissions[0].expired || !state.items.length)) {
  history.replaceState(null, '', `/pacient?pin=${encodeURIComponent(state.submissions[0].id)}`);
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
const isBusy = () => loadFailed || processing || sending || checking;

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
  if (isBusy()) return;
  history.pushState(null, '', `/pacient${query}`);
  message = '';
  render(true);
}

function saveStatus() {
  return unsaved
    ? '<span class="save-error">Změny nejsou uložené. Nezavírejte aplikaci.</span><button class="text-button" data-action="retry-save">Zkusit znovu</button>'
    : '';
}

function photoStatus() {
  return `${processing ? '<p class="photo-status" role="status"><span class="spinner" aria-hidden="true"></span> Načítám léčiva…</p>' : ''}
    ${photos.filter(job => job.status === 'error').map(job => `<p class="notice" role="alert">${escape(job.error)}</p>`).join('')}`;
}

function photoUpload() {
  const photoInputBlocked = loadFailed || sending || checking;
  return `<section class="photo-section${state.items.length ? '' : ' photo-section--intro'}" aria-labelledby="photo-title">
      <h2 id="photo-title">Nahrajte ${state.items.length ? 'další ' : ''}fotografie léků</h2>
      <div class="photo-actions">
        <button type="button" class="secondary full" data-action="gallery" ${photoInputBlocked ? 'disabled' : ''}>${icon('image')} Z galerie</button>
        <button type="button" class="primary full" data-action="camera" ${photoInputBlocked ? 'disabled' : ''}>${icon('camera')} Vyfotit</button>
      </div>
      ${photoStatus()}
    </section>`;
}

function editor() {
  const busy = isBusy();
  return `<h1 id="medicines-title" class="sr-only">Seznam léčiv</h1>
    <form id="list-form">
    <section class="medicines" aria-labelledby="medicines-title">
      ${state.items.length ? `<fieldset aria-labelledby="list-title" ${busy ? 'disabled' : ''}>
        <h2 id="list-title" class="list-heading">Seznam léčiv</h2>${state.items.map((item, index) => `
        <article class="medicine"><div class="medicine-info">
          <strong>${escape(item.name || 'Nečitelný název léčiva')}</strong>
          <span>${escape(medicineSummary(item))}</span></div>
          <button type="button" class="icon-button" data-action="remove" data-id="${escape(item.id)}" aria-label="Odstranit léčivo ${escape(item.name)}">${icon('trash')}</button>
        </article>`).join('')}</fieldset>`
      : ''}
    </section>
    ${photoUpload()}
    ${state.items.length || state.regimen || regimenOpen ? `${state.regimen || regimenOpen ? `<section class="regimen-section"><label for="regimen" class="sr-only">Režim onkologické léčby (volitelné)</label>
      <div class="combo"><input id="regimen" name="regimen" value="${escape(state.regimen || '')}" maxlength="200" placeholder="Režim onkologické léčby (volitelné)" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="regimen-list" aria-autocomplete="list" ${busy ? 'disabled' : ''}>
      <button type="button" class="icon-button" data-action="remove-regimen" aria-label="Odebrat režim" ${busy ? 'disabled' : ''}>${icon('close')}</button>
      <ul id="regimen-list" role="listbox" aria-label="Návrhy režimů" hidden></ul></div></section>`
      : `<button type="button" class="add-link" data-action="add-regimen" ${busy ? 'disabled' : ''}>${icon('plus')} Přidat režim onkologické léčby</button>`}
    ` : ''}
    ${state.items.length ? `<div class="send-panel"><button type="submit" id="send" class="primary full" ${!canSend(state.items) || busy ? 'disabled' : ''}>
      ${sending ? '<span class="spinner" aria-hidden="true"></span> Ukládám…' : 'Uložit seznam ' + icon('arrow')}</button>
      <p id="send-hint">${sendHint()}</p></div>` : ''}</form>`;
}

function sendHint() {
  if (processing) return '';
  if (!state.items.length || canSend(state.items)) return '';
  return 'Některá léčiva jsou neúplná. Odstraňte je a přidejte znovu.';
}

function render(focus = false) {
  const params = new URLSearchParams(location.search);
  const receipt = !params.has('list') && !params.has('new') && (!state.submissions[0]?.expired || !state.items.length) ? state.submissions[0] : undefined;
  const formatDate = value => new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
  const content = receipt ? `<main id="main" class="pin-screen">
    <section class="current-submission">${receipt.expired ? '<h1 class="expired-heading">PIN vypršel!</h1>' : verifiedEntry === receipt ? `<p class="pin-caption">PIN pro lékaře</p>
    <h1 class="pin" aria-label="PIN ${escape(receipt.pin.split('').join(' '))}">${escape(receipt.pin)}</h1>`
      : `<h1>${checking ? 'Ověřuji platnost…' : 'Platnost není ověřena'}</h1>`}
    <p class="validity-date${receipt.expired ? ' expired-date' : ''}">${receipt.expiresAt ? `${receipt.expired && Date.parse(receipt.expiresAt) <= Date.now() ? 'Platnost vypršela' : 'Platnost do'} <time datetime="${escape(receipt.expiresAt)}">${escape(formatDate(receipt.expiresAt))}</time>` : 'Datum vypršení platnosti není dostupné.'}
    ${receipt.expired ? `<button class="validity-help" data-action="local-copy-help" aria-label="Informace o lokální kopii" aria-expanded="${localCopyInfoOpen}" aria-controls="local-copy-info">?</button>` : receipt.expiresAt ? `<button class="validity-help" data-action="validity-help" aria-label="Informace o platnosti" aria-expanded="${validityInfoOpen}" aria-controls="validity-info">?</button>` : ''}</p>
    ${receipt.expired ? `<button class="primary" data-action="reupload" ${isBusy() ? 'disabled' : ''}>${sending ? 'Nahrávám…' : 'Obnovit záznam a získat nový PIN'}</button>
    <p class="validity-info generated-at" id="local-copy-info" ${localCopyInfoOpen ? '' : 'hidden'}>Lokální kopie pochází z nahrání <time datetime="${escape(receipt.sentAt)}">${escape(formatDate(receipt.sentAt))}</time>.</p>` : ''}
    ${!receipt.expired ? `<button class="primary" data-action="renew" ${isBusy() || verifiedEntry !== receipt ? 'disabled' : ''}>${sending ? 'Ukládám…' : 'Prodloužit platnost'}</button>
    <p class="validity-info" id="validity-info" ${validityInfoOpen ? '' : 'hidden'}>Data jsou uchována pouze dokud nejsou zobrazena zdravotníkem, nebo do uvedeného data platnosti. Pokud je vaše plánovaná návštěva až po konci platnosti, musíte platnost před návštěvou prodloužit.</p>` : ''}
    ${receipt.expired ? `<p class="notice">Původní PIN už nelze použít pro předání lékaři. Zde vidíte pouze lokální kopii uloženou v tomto zařízení, nikoli aktuálně sdílený seznam. Zkontrolujte, zda jsou léky stále aktuální. Seznam můžete zahodit, nebo jej znovu nahrát a získat nový PIN.</p>` : ''}
    ${receipt.expired ? `<div class="saved-list"><h2>Uložený seznam léčiv:</h2>
    ${receipt.regimen ? `<p>${escape(receipt.regimen)}</p>` : ''}
    ${receipt.items.map(item => `<p><strong>${escape(item.name)}</strong><br>${escape(medicineSummary(item))}</p>`).join('')}</div>` : ''}
    ${receipt.expired ? `<button class="secondary" data-action="discard-expired" ${isBusy() ? 'disabled' : ''}>Zahodit seznam</button>` : `
    ${verifiedEntry !== receipt && !checking ? `<button class="secondary" data-action="check-validity" ${loadFailed ? 'disabled' : ''}>Ověřit platnost</button>` : ''}
    <button class="secondary" data-action="open-list" data-id="${escape(receipt.id)}" ${isBusy() || verifiedEntry !== receipt ? 'disabled' : ''}>K seznamu ${icon('arrow')}</button>`}
    ${storageWarning ? `<p class="notice" role="alert">${escape(storageWarning)}</p>` : ''}
    <p class="save-status" role="status">${saveStatus()}</p><p class="message" role="status">${escape(message)}</p></section>
    </main>`
    : editor();
  const header = `<header><a class="brand" href="/pacient" data-action="home"><img src="/icons/icon.svg" width="36" height="36" alt="">PillGaze</a>
    <button class="install-button" data-action="install" aria-label="Nainstalovat aplikaci">${icon('download')}</button></header>`;
  app.innerHTML = receipt ? `<div class="shell">${header}${content}</div>` : `<div class="shell">${header}
    <main id="main">
      ${storageWarning ? `<p class="notice" role="alert">${escape(storageWarning)}</p>` : ''}
      <p class="save-status" id="save-status" role="status">${saveStatus()}</p>
      ${content}<p class="message" role="status" id="message">${escape(message)}</p></main></div>`;
  // File inputs live outside #app so pending recognition cannot replace an open chooser.
  for (const id of ['camera', 'gallery']) {
    document.getElementById(id).disabled = loadFailed || sending || checking || Boolean(receipt);
  }
  document.title = `${receipt ? 'PIN' : 'Seznam'} · PillGaze`;
  if (focus) {
    app.querySelector('h1').tabIndex = -1;
    app.querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

async function addPhotos(files) {
  if (!files.length || loadFailed || sending || checking) return;
  const jobs = files.map(file => ({ file, status: 'waiting' }));
  photos.push(...jobs);
  // One worker drains the queue, including photos added while recognition is pending.
  if (processing) {
    render();
    return;
  }
  processing = true;
  render();
  let job;
  while (!loadFailed && (job = photos.find(photo => photo.status === 'waiting'))) {
    job.status = 'processing';
    render();
    let url;
    try {
      if (!job.file.type.startsWith('image/')) throw new Error('Soubor není fotografie. Vyberte obrázek.');
      if (job.file.size > 20 * 1024 * 1024) throw new Error('Fotografie přesahuje 20 MB. Vyberte menší snímek.');
      url = URL.createObjectURL(job.file);
      const image = new Image();
      image.src = url;
      await image.decode().catch(() => { throw new Error('Fotku nelze přečíst. Zkuste JPEG, PNG nebo WebP.'); });
      render();
      const result = await recognizePhoto(job.file);
      if (loadFailed) break;
      const items = Array.isArray(result) ? result : result.items;
      const regimen = Array.isArray(result) ? '' : String(result.regimen || '').trim().slice(0, 200);
      state.items.push(...items);
      if (regimen && !state.regimen?.trim()) state.regimen = regimen;
      persist();
      job.status = 'done';
    } catch (error) {
      job.status = 'error';
      job.error = error.message || 'Fotografii se nepodařilo zpracovat. Přidejte ji prosím znovu.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      delete job.file;
      render();
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
    return document.getElementById('camera')?.click();
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
  if (event.target.id !== 'regimen' || isBusy()) return;
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

for (const id of ['camera', 'gallery']) {
  document.getElementById(id).addEventListener('change', event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void addPhotos(files);
  });
}

app.addEventListener('submit', async event => {
  event.preventDefault();
  if (isBusy() || !canSend(state.items)) return;
  const items = structuredClone(state.items);
  const regimen = state.regimen || '';
  const origin = location.search;
  const editing = state.submissions[0];
  sending = true;
  message = '';
  render();
  let entry;
  try {
    // Persist only the fields the doctor consumes; never upload local IDs or photo metadata.
    const { receipt, updatedExisting } = await savePatientList({ items, regimen }, editing);
    if (loadFailed) return;
    entry = updatedExisting
      ? updateSubmission(state, editing.id, items, receipt, regimen)
      : replaceSubmission(state, items, receipt, regimen);
    verifiedEntry = entry.ownerToken ? entry : undefined;
    editingSession = false;
    persist();
  } catch (error) {
    verifiedEntry = undefined;
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
    case 'local-copy-help':
      localCopyInfoOpen = !localCopyInfoOpen;
      render();
      app.querySelector('[data-action="local-copy-help"]')?.focus({ preventScroll: true });
      break;
    case 'validity-help':
      validityInfoOpen = !validityInfoOpen;
      render();
      app.querySelector('[data-action="validity-help"]')?.focus({ preventScroll: true });
      break;
    case 'reupload': {
      const previous = state.submissions[0];
      if (isBusy() || !previous?.expired) break;
      sending = true;
      message = '';
      render();
      try {
        // Explicit choice: upload exactly the displayed local snapshot, never PUT.
        const receipt = await sendList({ items: previous.items, regimen: previous.regimen || '' });
        if (loadFailed || state.submissions[0] !== previous) break;
        const entry = replaceSubmission(state, previous.items, receipt, previous.regimen || '');
        state.items = structuredClone(entry.items);
        state.regimen = entry.regimen || '';
        verifiedEntry = entry;
        editingSession = false;
        persist();
        history.replaceState(null, '', `/pacient?pin=${encodeURIComponent(entry.id)}`);
        message = 'Seznam byl znovu nahrán. Pro lékaře použijte nový PIN.';
      } catch (error) { message = error.message; }
      finally { sending = false; render(); }
      break;
    }
    case 'discard-expired':
      if (isBusy() || !state.submissions[0]?.expired) break;
      if (!window.confirm('Zahodit tento seznam a jeho lokální kopii? Tuto akci nelze vrátit.')) break;
      state.submissions = [];
      delete state.invalidatedDraft;
      verifiedEntry = undefined;
      persist();
      navigate();
      break;
    case 'check-validity': await refreshValidity(true); break;
    case 'renew': {
      if (isBusy()) break;
      const previous = state.submissions[0];
      if (!previous) break;
      sending = true;
      message = '';
      render();
      try {
        const receipt = await renewPatientList(previous);
        if (loadFailed) break;
        if (!receipt) {
          handleUnavailableList();
        } else {
          const entry = updateSubmission(state, previous.id, previous.items, receipt, previous.regimen || '');
          verifiedEntry = entry;
          message = 'Platnost obnovena na 14 dní.';
        }
        persist();
      } catch (error) { verifiedEntry = undefined; message = error.message; }
      finally { sending = false; render(); }
      break;
    }
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
      document.querySelector('.photo-section').tabIndex = -1;
      document.querySelector('.photo-section').focus({ preventScroll: true });
      break;
    case 'retry-save':
      persist();
      render();
      break;
    case 'open-list': {
      if (isBusy()) break;
      const entry = state.submissions.find(entry => entry.id === button.dataset.id);
      if (!entry) break;
      checking = true;
      render();
      try {
        const receipt = await validateList(entry);
        if (loadFailed) break;
        if (!receipt) { handleUnavailableList(); break; }
        Object.assign(entry, receipt);
        verifiedEntry = entry;
      } catch (error) {
        verifiedEntry = undefined;
        message = error.message;
        break;
      } finally { checking = false; render(); }
      // Returning from the PIN screen must not replace edits or additional photos
      // with the older submitted snapshot.
      if (!editingSession) {
        state.items = structuredClone(entry.items);
        state.regimen = entry.regimen || '';
      }
      editingSession = true;
      regimenOpen = false;
      persist();
      navigate(`?list=${encodeURIComponent(entry.id)}`);
      break;
    }
    case 'install':
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
      } else document.querySelector('#install-dialog').showModal();
      break;
  }
});

window.addEventListener('popstate', () => { message = ''; render(true); });
function invalidateCurrentList() {
  invalidateSubmission(state);
  photos.length = 0;
  regimenOpen = false;
  verifiedEntry = undefined;
  editingSession = false;
  persist();
  history.replaceState(null, '', '/pacient');
  message = 'Lokální kopii můžete zahodit nebo znovu nahrát pod novým PINem.';
}

function handleUnavailableList() {
  if (!editingSession) return invalidateCurrentList();
  invalidateSubmission(state, true);
  verifiedEntry = undefined;
  persist();
  history.replaceState(null, '', `/pacient?list=${encodeURIComponent(state.submissions[0].id)}`);
  message = 'Původní seznam již není platný. Uložte aktuální seznam pro získání nového PINu.';
}

async function refreshValidity(force = false) {
  const entry = state.submissions[0];
  if (!entry || entry.expired || loadFailed || checking || sending || processing) return;
  // Do not let background checks discard an active edit. Save validates afresh.
  if (!force && new URLSearchParams(location.search).has('list')) return;
  if (!force && Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  checking = true;
  verifiedEntry = undefined;
  message = '';
  render();
  try {
    const receipt = await validateList(entry);
    if (loadFailed || state.submissions[0] !== entry) return;
    if (!receipt) handleUnavailableList();
    else {
      Object.assign(entry, receipt);
      verifiedEntry = entry;
    }
    persist();
  } catch (error) { message = error.message; }
  finally { checking = false; render(); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshValidity();
});
window.addEventListener('focus', () => { void refreshValidity(); });
window.addEventListener('online', () => { void refreshValidity(); });
// Another tab can replace/delete the receipt. Never overwrite its newer state
// with this tab's stale draft or a late request result; require an explicit reload.
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
  loadFailed = true;
  verifiedEntry = undefined;
  storageWarning = 'Seznam byl změněn v jiné kartě. Obnovte stránku pro načtení aktuálních údajů.';
  if (cameraDialog.open) cameraDialog.close();
  render();
});
// Bounded, visible-tab-only checks; separate from the doctor's consuming GET budget.
setInterval(() => { if (document.visibilityState === 'visible') void refreshValidity(); }, 60_000);
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
void refreshValidity(true);
