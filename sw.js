// Service Worker — Excalibur Campo OS v2
const CACHE = 'excalibur-os-v2';
const OWN = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.allSettled(
        OWN.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] pre-cache falhou:', url);
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
  if (e.request.method !== 'GET') return; // POST/PATCH/DELETE passam direto

  var url = e.request.url;

  // Supabase: rede direta; camada JS cuida do offline via IndexedDB
  if (url.indexOf('supabase.co') !== -1) return;

  // Navegação (index.html): network-first com timeout, fallback cache
  // → pega atualizações quando online, carrega instantâneo offline
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      Promise.race([
        fetch(e.request).then(function(resp) {
          if (resp && resp.status === 200) {
            var clone = resp.clone();
            caches.open(CACHE).then(function(c) { c.put('./index.html', clone); });
          }
          return resp;
        }),
        new Promise(function(_, reject) { setTimeout(reject, 4000, new Error('timeout')); })
      ]).catch(function() {
        return caches.match('./index.html').then(function(c) {
          return c || caches.match('./');
        });
      })
    );
    return;
  }

  // Assets (CSS/fontes/imagens): cache-first, popula no primeiro acesso online
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        if (response && response.status === 200 &&
            (response.type === 'basic' || response.type === 'cors')) {
          var clone = response.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); }).catch(function(){});
        }
        return response;
      }).catch(function() {
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
