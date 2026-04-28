// Service Worker — STC Express PWA
// v1.0.0 — Cambia VERSION cuando hagas un release nuevo para forzar actualización

const VERSION = 'stc-express-v1.0.0';
const CACHE_STATIC = `${VERSION}-static`;

// Recursos que cacheamos en la instalación (app shell)
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Dominios que NO debemos cachear: backend dinámico, fuentes externas con CORS
const NO_CACHE_HOSTS = [
  'mensajeria-proxy.santiagostcoperaciones.workers.dev',
  'script.google.com',
  'script.googleusercontent.com'
];

// === INSTALL — precache de la app shell ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      // addAll falla si UN solo recurso falla. Usamos add() individuales con catch
      return Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] No pude cachear', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// === ACTIVATE — limpiar caches viejos ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// === FETCH — estrategia según tipo ===
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos GET — POST/PUT siempre van a red
  if (request.method !== 'GET') return;

  // Backend / proxy / Apps Script: siempre red, nunca caché
  if (NO_CACHE_HOSTS.some((h) => url.hostname.includes(h))) {
    return; // Default browser behavior (network)
  }

  // Recursos propios (app shell): cache-first con fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Solo cachea respuestas válidas
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => {
          // Sin red y sin cache: devolvemos index.html como fallback (SPA)
          if (request.mode === 'navigate') return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Fuentes externas (Google Fonts): stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// === Mensaje desde la app para forzar update ===
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
