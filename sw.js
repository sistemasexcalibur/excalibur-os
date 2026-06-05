// Service Worker — Excalibur Campo OS
const CACHE = 'excalibur-os-v1';

// Apenas arquivos LOCAIS no pre-cache (garantia de instalar sempre)
// Assets CDN são cacheados lazily na primeira visita online
const OWN = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // Cada arquivo em separado — falha isolada não cancela os outros
      return Promise.allSettled(
        OWN.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Falha ao cachear:', url, err.message);
          });
        })
      );
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Supabase: tenta rede — JS layer cuida do offline via IndexedDB
  if (url.indexOf('supabase.co') !== -1) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Tudo mais: cache-first + adiciona ao cache na primeira visita online
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;

      return fetch(e.request).then(function(response) {
        // Cacheia respostas válidas (básicas = mesmo origin, cors = CDN com headers)
        if (response && response.status === 200 &&
            (response.type === 'basic' || response.type === 'cors')) {
          var clone = response.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); }).catch(function(){});
        }
        return response;
      }).catch(function() {
        // Offline e não está em cache — fallback para o app shell
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
