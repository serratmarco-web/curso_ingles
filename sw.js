// ══════════════════════════════════════════════════════
// LinguaQuest — Service Worker
// Estratégia: Cache First + Network Fallback
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'linguaquest-v1';

// Recursos essenciais para funcionar offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  // Google Fonts (serão cacheados no primeiro acesso)
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap'
];

// ── INSTALL: pré-cacheia os arquivos essenciais ──────
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando arquivos essenciais');
        // Cacheia arquivos locais (crítico), fonts são opcionais
        return cache.addAll(['./', './index.html', './manifest.json'])
          .then(() => {
            // Tenta cachear fonts (não bloqueia se falhar)
            return cache.add('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap')
              .catch(() => console.log('[SW] Fonts serão cacheadas no primeiro uso'));
          });
      })
      .then(() => {
        console.log('[SW] Instalação concluída');
        return self.skipWaiting(); // Ativa imediatamente
      })
  );
});

// ── ACTIVATE: limpa caches antigos ──────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Removendo cache antigo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Ativo e controlando todas as abas');
        return self.clients.claim();
      })
  );
});

// ── FETCH: Cache First → Network → Fallback ─────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET e chrome-extension
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Estratégia para Google Fonts: Cache First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Estratégia para arquivos locais: Cache First com fallback de rede
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Para outras origens (ex: APIs): Network First
  event.respondWith(networkFirst(request));
});

// ── Estratégia: Cache First ─────────────────────────
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()); // Cacheia para a próxima vez
    }
    return response;
  } catch (err) {
    // Offline e não está no cache: retorna página principal como fallback
    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;
    return new Response('<h2>Você está offline. Abra o LinguaQuest online primeiro.</h2>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// ── Estratégia: Network First ───────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── PUSH NOTIFICATIONS (estrutura para uso futuro) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'LinguaQuest';
  const options = {
    body: data.body || '🔥 Mantenha seu streak! Estude hoje.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
