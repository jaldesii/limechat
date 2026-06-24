const CACHE_NAME = 'limechat-v3';
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
  self.clients.claim();
});

// ✅ FIXED: Fetch — Skip Socket.io & API requests
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // ✅ Don't intercept Socket.io or API requests
  if (url.includes('/socket.io/') || url.includes('/status')) {
    return; // Let browser handle normally
  }
  
  // ✅ Network first for everything else
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache GET requests
        if (event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});