export function createSyncManager({ outbox, db, userId, send, upload, refresh, changed = () => {}, online = () => navigator.onLine, locks = globalThis.navigator?.locks }) {
  let running = null, stopped = false, timer;
  async function process() {
    if (stopped || !online()) return;
    const blocked = new Set();
    for (const row of await outbox.list()) {
      if (stopped || !online()) break;
      if (row.userId !== userId || ['synced','superseded'].includes(row.status)) continue;
      if (row.status === 'failed' || blocked.has(row.farmId) || (row.nextAttemptAt || 0) > Date.now()) { blocked.add(row.farmId); continue; }
      const attempt = { ...row, status: 'syncing', retryCount: row.retryCount + 1, lastAttemptAt: new Date().toISOString() };
      await outbox.update(row, attempt); await changed();
      try {
        const saved = await db.get('blobs', row.id);
        if (saved && (saved.userId !== userId || saved.farmId !== row.farmId)) throw new Error('Foto de outra conta.');
        if (saved) await upload(row.payload.photo.storagePath, saved.blob);
        if (stopped) break;
        await send(row.farmId, row.clientMutationId, row.operation, row.payload);
        // A confirmação do servidor precede a remoção do blob. Queda aqui só causa retry idempotente.
        await outbox.complete(attempt);
      } catch (error) {
        const retryable = error.retryable === true || !online();
        const failed = !retryable || attempt.retryCount >= 5;
        await outbox.update(attempt, { status: failed ? 'failed' : 'pending', nextAttemptAt: Date.now() + Math.min(60000, 2000 * 2 ** attempt.retryCount), errorMessage: error.message || 'Não foi possível sincronizar esta movimentação.' });
        blocked.add(row.farmId);
      }
    }
    if (!stopped) { await refresh(); await changed(); await outbox.prune(); }
  }
  const manager = {
    get running() { return Boolean(running); },
    run() {
      if (stopped) return Promise.resolve();
      if (running) return running;
      clearTimeout(timer);
      const task = () => process();
      running = (locks ? locks.request(`controle-gado:sync:${userId}`, task) : task()).finally(async () => {
        running = null; await changed();
        if (!stopped && online()) {
          // Novas operações podem chegar enquanto o lote anterior é enviado.
          // Só a primeira operação não confirmada de cada fazenda é elegível.
          const farms = new Set(), pending = [];
          for (const row of await outbox.list()) {
            if (['synced','superseded'].includes(row.status) || farms.has(row.farmId)) continue;
            farms.add(row.farmId);
            if (['pending','syncing'].includes(row.status)) pending.push(row);
          }
          if (pending.length) timer = setTimeout(() => manager.run().catch(() => {}), Math.max(0, Math.min(...pending.map(r => r.nextAttemptAt || 0)) - Date.now()));
        }
      });
      return running;
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
  return manager;
}
