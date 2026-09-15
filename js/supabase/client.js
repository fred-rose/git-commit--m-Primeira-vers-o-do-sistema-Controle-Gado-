import { config } from '../config.js';
import { authStorage } from '../offline/db.js';
let instance;
export const cloudConfigured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey);
export async function getSupabase() {
  if (!cloudConfigured()) return null;
  if (!instance) {
    const { createClient } = await import('../vendor/supabase.js');
    instance = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { storage: authStorage(), flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  }
  return instance;
}
export function serviceError(error) {
  const technical = `${error?.message || ''} ${error?.details || ''}`;
  const transient = /fetch|network|failed to fetch|timeout|temporarily/i.test(technical) || Number(error?.status)>=500;
  let message = transient ? 'Sem conexão com o servidor. Tente novamente quando a internet voltar.' : 'Não foi possível concluir a operação. Confira os dados e tente novamente.';
  if (error?.code === '42501') message = 'Sua conta não tem acesso a esta fazenda.';
  if (error?.code === 'P0001') message = error.message;
  if (error?.code === '23514') message = 'Confira a quantidade, a data e os campos obrigatórios.';
  if (error?.code === '23505') message = 'Já existe um registro com essa identificação ou nome.';
  if (error?.code === '23503') message = 'Um dos vínculos não pertence a esta fazenda ou deixou de existir.';
  return Object.assign(new Error(message), { retryable: transient, code: error?.code });
}
export async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw serviceError(error);
  return data;
}
export async function uploadPhoto(client, path, blob) {
  if (!(blob instanceof Blob) || blob.size>1048576 || !['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('Foto inválida. Escolha JPG, PNG ou WebP de até 1 MB após redução.');
  const bucket = client.storage.from('farm-photos');
  const { error } = await bucket.upload(path, blob, { contentType: blob.type, upsert: false });
  if (!error) return;
  if (String(error.statusCode)==='409' || /already exists|duplicate/i.test(error.message)) {
    const existing = await bucket.download(path);
    if (existing.error) throw serviceError(existing.error);
    const hash = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer())).join(',');
    if (await hash(existing.data) === await hash(blob)) return;
    throw new Error('Já existe outra foto neste registro. O arquivo local foi preservado.');
  }
  throw serviceError(error);
}
