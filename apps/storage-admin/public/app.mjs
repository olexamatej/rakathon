export function formatSize(bytes) {
  return `${new Intl.NumberFormat('cs-CZ').format(bytes)} B`;
}

export function createClient(fetcher = globalThis.fetch, storage, now = Date.now) {
  // Tab-scoped only; never localStorage, URLs or service-worker caches.
  const key = 'pillgaze-storage-admin-session';
  const lifetime = 15 * 60 * 1000;
  let password = '';
  let expiresAt = 0;
  function logout() {
    password = '';
    expiresAt = 0;
    try { storage?.removeItem(key); } catch { /* Storage may be disabled. */ }
  }
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved && typeof saved.password === 'string' && saved.password
      && Number.isFinite(saved.expiresAt) && saved.expiresAt > now()
      && saved.expiresAt <= now() + lifetime) {
      password = saved.password;
      expiresAt = saved.expiresAt;
    } else logout();
  } catch { logout(); }
  return {
    login(value) {
      password = value;
      expiresAt = now() + lifetime;
      try { storage?.setItem(key, JSON.stringify({ password, expiresAt })); } catch { /* Fall back to memory. */ }
    },
    logout,
    remaining() { return password ? Math.max(0, expiresAt - now()) : 0; },
    async request(path, method = 'GET') {
      if (password && now() >= expiresAt) {
        logout();
        const error = new Error('Přihlášení vypršelo. Přihlaste se znovu.');
        error.status = 401;
        throw error;
      }
      if (!password) throw new Error('Nejdřív se přihlaste.');
      const response = await fetcher(`/api/v1/admin/blobs${path}`, {
        method,
        headers: { Authorization: `Bearer ${password}` },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 401) logout();
        const error = new Error(response.status === 401 ? 'Nesprávné heslo.'
          : response.status === 429 ? 'Příliš mnoho požadavků. Počkejte alespoň minutu.'
          : response.status === 404 ? 'Záznam neexistuje nebo administrace není zapnutá.'
          : 'Požadavek se nepodařil.');
        error.status = response.status;
        throw error;
      }
      return response.status === 204 ? null : response.json();
    },
  };
}

if (typeof document !== 'undefined') {
  let storage;
  try { storage = window.sessionStorage; } catch { /* Fall back to memory. */ }
  const client = createClient(globalThis.fetch, storage);
  const element = (id) => document.getElementById(id);
  let offset = 0;
  let busy = false;
  let sessionTimer;
  let generation = 0;

  function status(message, error = false) {
    element('status').textContent = message;
    element('status').dataset.error = String(error);
  }

  function logout(message = 'Odhlášeno.') {
    generation += 1;
    client.logout();
    clearTimeout(sessionTimer);
    element('password').value = '';
    element('rows').replaceChildren();
    element('storage').hidden = true;
    element('login').hidden = false;
    offset = 0;
    status(message);
  }

  function render(data) {
    const rows = data.items.map((item) => {
      const row = document.createElement('tr');
      const size = document.createElement('td');
      size.textContent = formatSize(item.sizeBytes);
      const digest = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = item.pinDigest;
      code.textContent = item.pin || item.pinDigest;
      digest.append(code);
      const content = document.createElement('td');
      const pre = document.createElement('pre');
      pre.textContent = item.payload ?? '(obsah skrytý nebo PIN nebyl uložen)';
      content.append(pre);
      const action = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger';
      button.textContent = 'Smazat';
      button.addEventListener('click', () => {
        if (!confirm(`Opravdu nevratně smazat záznam ${item.pinDigest}?`)) return;
        run(async () => {
          await client.request(`/${encodeURIComponent(item.pinDigest)}`, 'DELETE');
          await load();
        });
      });
      action.append(button);
      row.append(size, digest, content, action);
      return row;
    });
    element('rows').replaceChildren(...rows);
    element('previous').disabled = offset === 0;
    element('next').disabled = !data.hasMore;
    element('page').textContent = `Strana ${offset / 100 + 1}`;
    status(data.items.length ? `Zobrazeno ${data.items.length} záznamů.` : 'Žádné uložené záznamy na této straně.');
  }

  async function load() {
    const current = generation;
    const data = await client.request(`?offset=${offset}&includeSensitive=${element('show-sensitive').checked}`);
    if (current !== generation) return;
    element('login').hidden = true;
    element('storage').hidden = false;
    render(data);
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    const current = generation;
    const controls = [...document.querySelectorAll('button:not(#logout)')];
    const disabled = controls.map((button) => button.disabled);
    controls.forEach((button) => { button.disabled = true; });
    status('Načítání…');
    try { await action(); }
    catch (error) {
      if (current !== generation) return;
      if (error.status === 401) logout(error.message);
      status(error.message || 'Požadavek se nepodařil.', true);
    } finally {
      busy = false;
      controls.forEach((button, index) => {
        if (button.isConnected && !['previous', 'next'].includes(button.id)) button.disabled = disabled[index];
      });
      // On a failed load restore pagination controls too.
      if (element('status').dataset.error === 'true') {
        controls.forEach((button, index) => { if (['previous', 'next'].includes(button.id)) button.disabled = disabled[index]; });
      }
    }
  }

  element('show-sensitive').addEventListener('change', () => run(load));
  element('login').addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    client.login(element('password').value);
    element('password').value = '';
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => logout('Přihlášení vypršelo. Přihlaste se znovu.'), client.remaining());
    run(load);
  });
  element('logout').addEventListener('click', () => logout());
  element('refresh').addEventListener('click', () => run(load));
  element('previous').addEventListener('click', () => run(async () => {
    const previous = offset;
    offset = Math.max(0, offset - 100);
    try { await load(); } catch (error) { offset = previous; throw error; }
  }));
  element('next').addEventListener('click', () => run(async () => {
    const previous = offset;
    offset += 100;
    try { await load(); } catch (error) { offset = previous; throw error; }
  }));
  if (client.remaining()) {
    sessionTimer = setTimeout(() => logout('Přihlášení vypršelo. Přihlaste se znovu.'), client.remaining());
    run(load);
  }
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      if (!client.remaining()) logout('Přihlášení vypršelo. Přihlaste se znovu.');
      else run(load);
    }
  });
}
