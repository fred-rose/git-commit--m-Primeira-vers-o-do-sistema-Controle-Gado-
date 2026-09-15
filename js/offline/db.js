const DATABASE = 'controle-gado:cloud:v2';
export function createOfflineDB(indexedDB = globalThis.indexedDB) {
  let connection;
  async function open() {
    if (!indexedDB) throw new Error('Este navegador não permite o armazenamento offline.');
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('kv', { keyPath: 'id' });
        for (const name of ['outbox', 'blobs']) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('userId', 'userId');
        }
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
      request.onerror = () => { connection = null; reject(new Error('Não foi possível abrir os dados offline.')); };
      request.onblocked = () => reject(new Error('Feche outras abas para atualizar o armazenamento offline.'));
    });
    return connection;
  }
  async function transaction(names, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(new Error('Não foi possível salvar os dados offline. Verifique o espaço disponível.'));
      try { operation(tx, result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
    });
  }
  return {
    transaction,
    get: (store, id) => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).get(id).onsuccess = event => done(event.target.result); }),
    put: (store, value) => transaction([store], 'readwrite', tx => { tx.objectStore(store).put(value); }),
    remove: (store, id) => transaction([store], 'readwrite', tx => { tx.objectStore(store).delete(id); }),
    list: (store, userId) => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).index('userId').getAll(userId).onsuccess = event => done(event.target.result); }),
  };
}
export const offlineDB = createOfflineDB();
export function authStorage(db = offlineDB) {
  return {
    getItem: async key => (await db.get('kv', `auth:${key}`))?.value ?? null,
    setItem: (key, value) => db.put('kv', { id: `auth:${key}`, value }),
    removeItem: key => db.remove('kv', `auth:${key}`),
  };
}
