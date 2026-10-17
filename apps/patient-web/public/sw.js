// Retire older app-shell workers and caches. The app now always loads online.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('pillgaze-patient-'))
      .map(key => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
