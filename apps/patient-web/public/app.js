import { createState, loadState, saveState, recordSubmission, canSend, toText } from './lists.js';
import { recognizePhoto, sendList } from './services.js';

const app = document.querySelector('#app');
const photos = [];
let state = createState();
let unsaved = false;
let processing = false;
let sending = false;
let loadFailed = false;
let storageWarning = '';
let message = '';
let installPrompt;

try {
  const loaded = loadState(localStorage);
  state = loaded.state;
  if (loaded.skipped) storageWarning = 'Některá starší data nelze načíst. Původní záznamy zůstaly zachované.';
} catch {
  loadFailed = true;
  storageWarning = 'Uložený seznam nelze načíst. Původní data zůstala zachovaná. Zkuste stránku obnovit.';
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const icons = {
  arrow: '<path d="m9 5 7 7-7 7"/>',
  camera: '<path d="M4 6h4l2-3h4l2 3h4v14H4z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const date = value => new Intl.DateTimeFormat('cs', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('cs', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
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

function historyView() {
  return `<h1 class="sr-only">Historie odeslání</h1>
    ${state.submissions.length ? `<div class="history-list">${state.submissions.map(entry => `
      <details class="submission"><summary><span>${escape(date(entry.sentAt))} v ${escape(time(entry.sentAt))}<small>${itemCount(entry.items.length)}</small></span>
        <code>${escape(entry.pin)}</code></summary>
        <ul>${entry.items.map(item => `<li><strong>${escape(item.name)}</strong><span>${escape(item.dosage)} · ${escape(item.dosesPerPackage)} dávek v balení</span></li>`).join('')}</ul>
      </details>`).join('')}</div>`
      : `<div class="empty-history">${icon('history')}<h2>Zatím žádná odeslání</h2></div>`}`;
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
          <strong>${escape(item.name)}</strong>
          <span>${escape(item.dosage)} · ${escape(item.dosesPerPackage)} dávek v balení</span></div>
          <button type="button" class="icon-button" data-action="remove" data-id="${escape(item.id)}" aria-label="Odstranit léčivo ${escape(item.name)}">${icon('trash')}</button>
        </article>`).join('')}</fieldset>`
      : `<div class="empty-list">${icon('list')}<strong>Seznam je prázdný</strong></div>`}
    </section>
    <section class="photo-section" aria-labelledby="photo-title"><div class="section-heading"><h2 id="photo-title">Přidejte fotografie</h2></div>
      <div class="photo-actions"><button type="button" class="secondary" data-action="gallery" ${busy ? 'disabled' : ''}>${icon('image')} Z galerie</button>
        <button type="button" class="secondary" data-action="camera" ${busy ? 'disabled' : ''}>${icon('camera')} Vyfotit</button></div>
      <input type="file" id="camera" accept="image/*" capture="environment" hidden ${busy ? 'disabled' : ''}>
      <input type="file" id="gallery" accept="image/*" multiple hidden ${busy ? 'disabled' : ''}>
      ${photoRows()}
    </section>
    <div class="send-panel"><button type="submit" id="send" class="primary full" ${!canSend(state.items) || busy ? 'disabled' : ''}>
      ${sending ? '<span class="spinner" aria-hidden="true"></span> Odesílám…' : 'Odeslat seznam ' + icon('arrow')}</button>
      <p id="send-hint">${sendHint()}</p></div></form>`;
}

function sendHint() {
  if (processing || !state.items.length || canSend(state.items)) return '';
  return 'Některá léčiva jsou neúplná. Odstraňte je a přidejte znovu.';
}

function render(focus = false) {
  const params = new URLSearchParams(location.search);
  const receipt = state.submissions.find(entry => entry.id === params.get('pin'));
  const showHistory = params.has('historie');
  if ((receipt || showHistory) && !processing) {
    photos.splice(0).forEach(job => { if (job.url) URL.revokeObjectURL(job.url); });
  }
  const content = receipt ? `<main id="main" class="pin-screen">
    <h1 class="pin" aria-label="PIN ${escape(receipt.pin.split('').join(' '))}">${escape(receipt.pin)}</h1>
    <button class="primary" data-action="home">Domů</button></main>`
    : showHistory ? historyView() : editor();
  app.innerHTML = receipt ? content : `<div class="shell"><header><a class="brand" href="/pacient" data-action="home"><img src="/icons/icon.svg" width="36" height="36" alt="">PillGaze</a>
    <button class="install-button" data-action="install" aria-label="Nainstalovat aplikaci">${icon('download')}</button></header>
    <main id="main"><nav class="view-tabs" aria-label="Přehled pacienta">
      <a href="/pacient" data-action="home" ${!showHistory ? 'aria-current="page"' : ''}>Seznam</a>
      <a href="/pacient?historie=1" data-action="history" ${showHistory ? 'aria-current="page"' : ''}>Historie odeslání</a>
    </nav>
      ${storageWarning ? `<p class="notice" role="alert">${escape(storageWarning)}</p>` : ''}
      <p class="save-status" id="save-status" role="status">${saveStatus()}</p>
      ${content}<p class="message" role="status" id="message">${escape(message)}</p></main></div>`;
  document.title = `${receipt ? 'PIN' : showHistory ? 'Historie odeslání' : 'Seznam'} · PillGaze`;
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
      const items = await recognizePhoto(job.file);
      job.count = items.length;
      state.items.push(...items);
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

// Phones use the native camera via <input capture>; desktops ignore `capture`, so stream the webcam instead.
async function openCamera() {
  const input = document.getElementById('camera');
  if (matchMedia('(pointer: coarse)').matches || !navigator.mediaDevices?.getUserMedia) return input.click();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
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

app.addEventListener('change', event => {
  if (['camera', 'gallery'].includes(event.target.id)) {
    void addPhotos(Array.from(event.target.files || []));
  }
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  if (isBusy() || !canSend(state.items)) return;
  const items = structuredClone(state.items);
  const origin = location.search;
  sending = true;
  message = '';
  render();
  let entry;
  try {
    const receipt = await sendList(toText(items));
    entry = recordSubmission(state, items, receipt);
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
    case 'history': navigate('?historie=1'); break;
    case 'camera': await openCamera(); break;
    case 'gallery': document.getElementById('gallery').click(); break;
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
  navigator.serviceWorker.register('/sw.js').catch(() => {
    console.warn('Offline režim není dostupný. Aplikaci můžete dál používat online.');
  });
}
persist();
render();
