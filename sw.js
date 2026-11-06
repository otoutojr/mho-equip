/* 装備おすすめ service worker: ネットワーク優先、オフライン時はキャッシュ */
const VERSION = '2026.11.06-12';
const CACHE = 'mho-equip-' + VERSION;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'solver.js', 'manifest.webmanifest',
  'data/armor.json', 'data/skills.json', 'data/monsters.json', 'data/characters.json', 'data/weapons.json', 'data/builds.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc. go to the network
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
