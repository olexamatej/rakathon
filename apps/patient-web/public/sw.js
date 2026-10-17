// Bump the cache version when changing the application shell.
const CACHE = 'pillgaze-patient-v49';
const SHELL = ['/pacient', '/styles.css', '/app.js', '/lists.js', '/services.js',
  '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('pillgaze-patient-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname === '/pacient/' ? '/pacient' : url.pathname;
  if (!SHELL.includes(path)) return;
  // Cache only the app shell, never photographs, list data or API requests.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(path, response.clone());
      return response;
    } catch {
      return await cache.match(path) || Response.error();
    }
  })());
});
