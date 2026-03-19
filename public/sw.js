const CACHE_VERSION = 'v2';
const HTML_CACHE = `family-reunion-html-${CACHE_VERSION}`;
const ASSET_CACHE = `family-reunion-assets-${CACHE_VERSION}`;
const APP_SHELL = ['/index.html', '/manifest.webmanifest'];

const isHtmlRequest = (request) => {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
};

const isStaticAsset = (request, url) => {
  if (request.destination && ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination)) {
    return true;
  }
  return url.pathname.startsWith('/assets/') || url.pathname.endsWith('.webmanifest');
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(HTML_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== HTML_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

const networkFirstHtml = async (request) => {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(HTML_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match('/index.html');
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Offline' });
  }
};

const cacheFirstAsset = async (request) => {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === '/sw.js') {
    return;
  }

  if (isHtmlRequest(event.request)) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }

  if (isStaticAsset(event.request, url)) {
    event.respondWith(cacheFirstAsset(event.request));
  }
});
