import { pageHeading,table,button } from '../components/ui.js';
import { escapeHtml as h,number,formatDate } from '../utils.js';
export function render(data,filters={}){
  const admin=data.adminData;
  if(!admin)return `${pageHeading('Administração','Consulta de usuários, fazendas e atividade.',button('Carregar administração','load-admin'))}`;
  const {totals,users,farms,activity}=admin;
  const selected=filters.user?farms.filter(f=>f.created_by===filters.user):farms;
  return `${pageHeading('Administração','Fazendas de terceiros são abertas somente para consulta.',button('Atualizar','load-admin'))}<nav class="admin-tabs"><a href="#administracao">Visão geral</a><a href="#administracao?tab=users">Usuários</a><a href="#administracao?tab=farms">Fazendas</a><a href="#administracao?tab=activity">Atividade</a></nav><div class="category-strip">${[['Usuários',totals.users],['Fazendas',totals.farms],['Fazendas ativas',totals.activeFarms],['Cabeças',totals.heads],['Movimentações em 30 dias',totals.movements30Days]].map(([k,v])=>`<div><span>${k}</span><strong>${number(v)}</strong></div>`).join('')}</div>
  ${!filters.tab||filters.tab==='users'?`<section class="panel"><h3>Usuários</h3>${table(['Nome','Email','Fazendas','Cabeças','Cadastro'],users.map(u=>[`<a href="#administracao?tab=farms&user=${h(u.id)}">${h(u.name||'Sem nome')}</a>`,h(u.email),number(u.farms),number(u.heads),formatDate(u.created_at.slice(0,10))]))}</section>`:''}
  ${!filters.tab||filters.tab==='farms'?`<section class="panel"><h3>Fazendas</h3>${table(['Nome','Proprietário','Modo','Cabeças','Cadastro','Consulta'],selected.map(f=>[h(f.name),h(f.owner_name||f.owner_email),f.control_mode==='pasture'?'Por pastos':'Fazenda inteira',number(f.heads),formatDate(f.created_at.slice(0,10)),button('Visualizar','admin-view',f.id)]))}</section>`:''}
  ${!filters.tab||filters.tab==='activity'?`<section class="panel"><h3>Atividade recente</h3>${table(['Data','Fazenda','Tipo','Categoria','Quantidade'],activity.map(m=>[formatDate(m.date),h(m.farm_name),h(m.type),h(m.category),number(m.quantity)]))}</section>`:''}<p class="page-footnote">Listas limitadas aos 500 cadastros mais recentes e às 100 últimas movimentações. Os totais abrangem o sistema inteiro.</p>`;
}
