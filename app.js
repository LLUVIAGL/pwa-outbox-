const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const badgeRed = document.getElementById('estado-red');
const form = document.getElementById('form-tarea');
const listaOutbox = document.getElementById('lista-outbox');
const btnPurgar = document.getElementById('btn-purgar');
const btnSincronizar = document.getElementById('btn-sincronizar');

// 1. Indicador visual de red
function actualizarEstadoRed() {
  if (navigator.onLine) {
    badgeRed.textContent = ' En línea (Online)';
    badgeRed.className = 'badge online';
  } else {
    badgeRed.textContent = ' Sin conexión (Offline - Modo Outbox activo)';
    badgeRed.className = 'badge offline';
  }
}
window.addEventListener('online', actualizarEstadoRed);
window.addEventListener('offline', actualizarEstadoRed);

// 2. Renderizar registros pendientes de IndexedDB en el DOM
function renderizarOutbox() {
  obtenerTodosOutbox()
    .then((registros) => {
      listaOutbox.innerHTML = '';
      if (registros.length === 0) {
        listaOutbox.innerHTML = '<li>No hay peticiones pendientes en cola.</li>';
        return;
      }
      registros.forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span><strong>#${item.id}</strong> - ${item.datos.title}</span>
          <span> ${item.estado}</span>
        `;
        listaOutbox.appendChild(li);
      });
    })
    .catch((err) => console.error('Error al leer Outbox:', err));
}

// 3. Registrar tarea de Background Sync o activar Fallback para Safari/iOS
function programarSincronizacion() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((registration) => {
        return registration.sync.register('sync-outbox');
      })
      .then(() => console.log('[App] Tag "sync-outbox" registrado en Background Sync'))
      .catch((err) => console.error('[App] Falló registro de Sync:', err));
  } else {
    console.warn('[App] SyncManager no soportado (ej. Safari/iOS). Usando fallback evento online.');
    if (navigator.onLine) {
      sincronizarFallbackManual();
    }
  }
}

// Respaldo exclusivo para navegadores sin SyncManager
function sincronizarFallbackManual() {
  obtenerTodosOutbox().then((registros) => {
    const promesas = registros.map((item) => {
      return fetch(item.url, {
        method: item.metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.datos)
      }).then((res) => {
        if (res.ok) return eliminarDeOutbox(item.id);
      });
    });
    return Promise.all(promesas).then(() => renderizarOutbox());
  });
}

// Si el navegador NO soporta SyncManager, escuchar evento 'online'
if (!('SyncManager' in window)) {
  window.addEventListener('online', () => {
    console.log('[App Fallback] Conexión recuperada. Sincronizando Outbox...');
    sincronizarFallbackManual();
  });
}

// 4. Captura del formulario POST (Network con fallback a Outbox en IndexedDB)
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const datosPost = {
    title: document.getElementById('titulo').value,
    body: document.getElementById('descripcion').value,
    userId: 1
  };

  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosPost)
  })
    .then((response) => {
      if (!response.ok) throw new Error('Error HTTP ' + response.status);
      return response.json();
    })
    .then((data) => {
      alert(' Enviado directamente al servidor. ID respuesta: ' + data.id);
      form.reset();
    })
    .catch(() => {
      console.warn('[App] Sin red. Encolando petición POST en IndexedDB...');
      guardarEnOutbox({ url: API_URL, datos: datosPost })
        .then(() => {
          form.reset();
          renderizarOutbox();
          programarSincronizacion();
        })
        .catch((err) => console.error('Error guardando en Outbox:', err));
    });
});

// Botones de gestión manual
btnPurgar.addEventListener('click', () => {
  purgarOutbox().then(() => renderizarOutbox());
});

btnSincronizar.addEventListener('click', () => {
  programarSincronizacion();
});

// 5. Registro del Service Worker y recepción de mensajes (postMessage)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('[App] Service Worker registrado'))
    .catch((err) => console.error('[App] Error registrando SW:', err));

  // Escuchar notificación del SW cuando termina de sincronizar en segundo plano
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.tipo === 'SYNC_COMPLETADO') {
      console.log('[App] Mensaje recibido del SW:', event.data.mensaje);
      renderizarOutbox(); // Refresca la lista en pantalla automáticamente
    }
  });
}

// Inicialización
actualizarEstadoRed();
renderizarOutbox();