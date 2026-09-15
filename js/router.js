export const routes = {
  dashboard: { title: 'Dashboard', icon: 'dashboard' },
  evolucao: { title: 'Evolução', icon: 'reports' },
  rebanho: { title: 'Rebanho', icon: 'herd' },
  movimentacoes: { title: 'Movimentações', icon: 'movements' },
  pastos: { title: 'Pastos', icon: 'pastures' },
  financeiro: { title: 'Financeiro', icon: 'finance' },
  alertas: { title: 'Alertas', icon: 'reports', cloudOnly: true },
  fotos: { title: 'Fotos', icon: 'photos' },
  relatorios: { title: 'Relatórios', icon: 'reports' },
  configuracoes: { title: 'Configurações', icon: 'settings' },
  administracao: { title: 'Administração', icon: 'settings', adminOnly: true },
};
export function currentRoute() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  return { page: routes[path] ? path : 'dashboard', filters: Object.fromEntries(new URLSearchParams(query)) };
}
export function navigate(page, filters = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  location.hash = page + (params.size ? `?${params}` : '');
}
