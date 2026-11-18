// db-helper.js - Mini-Wrapper Promisificado para IndexedDB (100% Vanilla JS, sin async/await)
const DB_NAME = 'pwa-outbox-db';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

/**
 * Abre (o crea/actualiza) la base de datos IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Se ejecuta solo si la BD no existe o si DB_VERSION aumentó
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // keyPath 'id' autoincremental para identificar cada petición encolada
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('estado', 'estado', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Guarda una petición POST fallida en la cola Outbox (Transacción readwrite)
 */
function guardarEnOutbox(payload) {
  return abrirDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const registro = {
        url: payload.url,
        metodo: 'POST',
        datos: payload.datos,
        estado: 'pendiente',
        fecha: new Date().toISOString()
      };

      const req = store.add(registro);
      req.onsuccess = () => resolve(req.result); // Devuelve el ID autogenerado
      tx.onerror = () => reject(tx.error);
    });
  });
}

/**
 * Obtiene todos los registros almacenados en Outbox (Transacción readonly)
 */
function obtenerTodosOutbox() {
  return abrirDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  });
}

/**
 * Elimina un registro específico por su ID tras sincronizarse (Transacción readwrite)
 */
function eliminarDeOutbox(id) {
  return abrirDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

/**
 * Purga toda la cola Outbox manualmente (Transacción readwrite)
 */
function purgarOutbox() {
  return abrirDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}