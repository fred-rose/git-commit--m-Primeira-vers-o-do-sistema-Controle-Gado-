export const isOnline = () => globalThis.navigator?.onLine !== false;
export function watchConnectivity(callback) {
  globalThis.addEventListener('online', callback);
  globalThis.addEventListener('offline', callback);
  return () => { globalThis.removeEventListener('online', callback); globalThis.removeEventListener('offline', callback); };
}
