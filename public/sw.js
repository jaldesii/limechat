const CACHE_NAME = 'limechat-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png' // ✅ Removed trailing comma
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

// ✅ FIXED: Fetch — proper Response fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // ✅ Skip Socket.io, API, at Chrome DevTools requests
  if (url.includes('/socket.io/') || 
      url.includes('/status') ||
      url.includes('chrome-extension://') ||
      event.request.method !== 'GET') {
    return; // Let browser handle
  }
  
  // ✅ Network first with proper fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache successful GET responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          }).catch(() => {
            // Ignore cache put errors
          });
        }
        return response;
      })
      .catch(() => {
        // ✅ Network failed, try cache
        return caches.match(event.request).then(cachedResponse => {
          // ✅ Always return a valid Response object
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // ✅ For navigation requests, return index.html (SPA fallback)
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          
          // ✅ Fallback for other requests
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});