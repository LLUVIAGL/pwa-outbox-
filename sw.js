// Importar el helper de IndexedDB dentro del hilo del Service Worker
importScripts('./db-helper.js');

const CACHE_STATIC = 'outbox-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './db-helper.js',
  './app.js'
];

// 1. INSTALACIÓN: Precache del App Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
});

// 2. ACTIVACIÓN: Limpieza de cachés antiguas y toma de control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_STATIC) return caches.delete(key);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. INTERCEPTOR FETCH: Cache First solo para peticiones GET del App Shell
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((resCache) => {
        return resCache || fetch(event.request);
      })
    );
  }
});

// 4. BACKGROUND SYNC API: Motor de sincronización en segundo plano
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    console.log('[SW] Evento sync detectado. Procesando cola Outbox...');
    event.waitUntil(procesarColaOutbox());
  }
});

function procesarColaOutbox() {
  return obtenerTodosOutbox()
    .then((registros) => {
      if (registros.length === 0) return;

      // Enviar todas las peticiones pendientes en paralelo con Promise.all
      const envios = registros.map((item) => {
        return fetch(item.url, {
          method: item.metodo,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.datos)
        })
          .then((response) => {
            if (!response.ok) throw new Error('Fallo en servidor: ' + response.status);
            // Si el servidor aceptó el POST, eliminamos el registro de IndexedDB
            return eliminarDeOutbox(item.id);
          });
      });

      return Promise.all(envios);
    })
    .then(() => {
      // Notificar a todas las pestañas abiertas mediante postMessage
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    })
    .then((clientes) => {
      if (!clientes) return;
      clientes.forEach((cliente) => {
        cliente.postMessage({
          tipo: 'SYNC_COMPLETADO',
          mensaje: 'Todos los registros pendientes fueron sincronizados con el servidor.'
        });
      });
    })
    .catch((err) => {
      console.error('[SW] Error durante sincronización (se reintentará automáticamente):', err);
      throw err; // Relanzar el error indica al navegador que reprograme el sync
    });
}