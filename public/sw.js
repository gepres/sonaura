// Service worker de la web de Sonaura (PWA). Lo registra src/lib/pwa.web.ts, solo en el navegador
// (nunca en la app de Windows, que usa el mismo export).
//
// Hace poco a propósito, para que una versión nueva de la web nunca se quede atrás:
// - La página se pide siempre a la red. La copia guardada solo se usa sin conexión, para que la
//   app instalada abra igual y muestre la biblioteca guardada.
// - Lo de /_expo/static y /assets lleva el hash en el nombre: se guarda la primera vez y no cambia.
// - Lo demás pasa directo: Drive, GitHub, las estadísticas (/pulso), el manifiesto…

const VERSION = 'v1';
const SHELL = `sonaura-pagina-${VERSION}`;
const STATIC = `sonaura-estaticos-${VERSION}`;
const MAX_STATIC = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add('/'))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sonaura-') && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimStatic() {
  const cache = await caches.open(STATIC);
  const keys = await cache.keys();
  // Las de builds viejos se van quedando: se borran las más antiguas.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC)).map((k) => cache.delete(k)));
}

async function page(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      // Es una SPA: todas las rutas devuelven el mismo index.html.
      void caches.open(SHELL).then((cache) => cache.put('/', copy));
    }
    return response;
  } catch (error) {
    const cached = await caches.match('/', { cacheName: SHELL });
    if (cached) return cached;
    throw error;
  }
}

async function hashed(request) {
  const cached = await caches.match(request, { cacheName: STATIC });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void caches
      .open(STATIC)
      .then((cache) => cache.put(request, copy))
      .then(trimStatic);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(hashed(request));
  }
});
