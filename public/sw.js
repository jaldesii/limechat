const CACHE_NAME = 'limechat-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
];

// Install
self.addEventListener('install', (event) => {
  console.log('🟢 Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('🟢 Service Worker: Caching assets');
      return cache.addAll(ASSETS).catch(err => {
        console.log('⚠️ Cache addAll error:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  console.log('🟢 Service Worker: Activated');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('🗑️ Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  // Take control of all clients
  self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Offline - try cache
        return caches.match(event.request);
      })
  );
});