export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const number = value => new Intl.NumberFormat('pt-BR').format(value);
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const formatDate = value => value ? value.split('-').reverse().join('/') : '—';
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const matches = (query, values) => normalize(values.join(' ')).includes(normalize(query || ''));
export const nameOf = (list, id) => list.find(item => item.id === id)?.name || '—';
export const inPeriod = (date, filters) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues também está disponível em HTTP na rede local da fazenda.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};
export function toCents(value) {
  let str = String(value || '0').trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(str)) str = str.replaceAll('.', '');
  str = str.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(str)) throw new Error('Informe um valor positivo com até duas casas decimais.');
  const [whole, fraction = ''] = str.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('O valor informado é muito alto.');
  return cents;
}
export function download(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n');
}
