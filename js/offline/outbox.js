export function createOutbox(db, userId) {
  if (!userId) throw new Error('Entre na sua conta antes de registrar no campo.');
  const list = async () => (await db.list('outbox', userId)).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  return {
    list,
    async enqueue({ farmId, payload, blob, clientMutationId = crypto.randomUUID() }) {
      const rows = await list();
      if (rows.filter(r => !['synced','superseded'].includes(r.status)).length >= 1000) throw new Error('Sincronize as pendências antes de registrar mais alterações.');
      const row = { id: `${userId}:${clientMutationId}`, clientMutationId, userId, farmId, operation: 'movement.save', payload: structuredClone(payload), status: 'pending', createdAt: new Date().toISOString(), order: Math.max(0,...rows.map(r => r.order || 0)) + 1, lastAttemptAt: null, retryCount: 0, errorMessage: '' };
      await db.transaction(['outbox','blobs','kv'], 'readwrite', tx => {
        const counter=tx.objectStore('kv'),key=`outbox-sequence:${userId}`;
        counter.get(key).onsuccess=event=>{
          row.order=(event.target.result?.value||0)+1;counter.put({id:key,value:row.order});
          tx.objectStore('outbox').add(row);
          if (blob) tx.objectStore('blobs').add({ id: row.id, userId, farmId, blob });
        };
      });
      return row;
    },
    async update(row, patch) {
      if (row.userId !== userId) throw new Error('Operação de outra conta.');
      await db.put('outbox', { ...row, ...patch });
    },
    async complete(row) {
      if (row.userId !== userId) throw new Error('Operação de outra conta.');
      await db.transaction(['outbox','blobs'], 'readwrite', tx => {
        tx.objectStore('outbox').put({ ...row, status: 'synced', errorMessage: '', syncedAt: new Date().toISOString() });
        tx.objectStore('blobs').delete(row.id);
      });
    },
    async retry(id) {
      const row = await db.get('outbox', id);
      if (!row || row.userId !== userId || ['synced','superseded'].includes(row.status)) throw new Error('Pendência não encontrada.');
      await db.put('outbox', { ...row, status: 'pending', retryCount: 0, errorMessage: '', nextAttemptAt: 0 });
    },
    async replace(row,payload,clientMutationId){
      if(row.userId!==userId||row.status!=='failed')throw new Error('Somente uma pendência com falha pode ser revisada.');
      const next={...row,id:`${userId}:${clientMutationId}`,clientMutationId,payload,status:'pending',retryCount:0,errorMessage:'',nextAttemptAt:0};
      await db.transaction(['outbox','blobs'],'readwrite',tx=>{
        tx.objectStore('outbox').put({...row,status:'superseded',replacedBy:next.id});
        tx.objectStore('outbox').add(next);
        tx.objectStore('blobs').get(row.id).onsuccess=event=>{if(event.target.result){tx.objectStore('blobs').put({...event.target.result,id:next.id});tx.objectStore('blobs').delete(row.id);}};
      });return next;
    },
    async prune() {
      for (const row of await list()) if (row.status === 'synced' && Date.now() - Date.parse(row.syncedAt) > 7 * 86400000) await db.remove('outbox', row.id);
    },
  };
}
