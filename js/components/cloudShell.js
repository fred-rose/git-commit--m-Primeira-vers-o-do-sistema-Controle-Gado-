import { ALL_FARMS } from '../services/farmData.js';
import { activeAlerts } from '../capacity/alertsService.js';
import { capacitySummary } from '../capacity/capacityService.js';
import { quickButtons } from './cloudForms.js';
import { escapeHtml as h,number } from '../utils.js';
import { STORAGE_KEY,CATEGORIES } from '../constants.js';
import { navigate } from '../router.js';
import { toast } from './toast.js';
export function renderCloudShell(repository,data,page,assistant){
  let toolbar=document.getElementById('farm-toolbar');
  if(!toolbar){toolbar=document.createElement('div');toolbar.id='farm-toolbar';toolbar.className='farm-toolbar no-print';document.querySelector('.topbar').after(toolbar);}
  const pending=data.pendingSync.length;
  const status=data.syncing?(pending?`Sincronizando ${pending} alterações…`:'Atualizando fazenda…'):!data.online?`Offline${pending?` · ${pending} pendentes`:''}`:pending?`Online · ${pending} pendentes`:'Sincronizado';
  toolbar.innerHTML=`<label><span>Fazenda</span><select id="farm-selector" aria-label="Selecionar fazenda"><option value="${ALL_FARMS}">Todas as fazendas</option>${repository.farms.map(f=>`<option value="${h(f.id)}" ${repository.selected===f.id?'selected':''}>${h(f.name)}</option>`).join('')}${data.readOnly?`<option selected value="${h(data.farm.id)}">${h(data.farm.name)} (consulta)</option>`:''}</select></label><button class="text-button" data-action="new-farm">Nova fazenda</button><span class="connectivity" role="status">${h(status)}</span><button class="secondary-button" data-action="open-alerts" aria-label="Central de alertas">Alertas · ${activeAlerts(data).length}</button><button class="text-button" data-action="logout">Sair</button>`;
  document.getElementById('farm-selector').onchange=async e=>{const select=e.target;select.disabled=true;select.setAttribute('aria-busy','true');toolbar.querySelector('.connectivity').textContent='Carregando fazenda…';try{assistant?.clearConversation();await repository.selectFarm(select.value);navigate('dashboard');}catch(error){toast(error.message,true);select.value=repository.selected;}finally{select.disabled=false;select.removeAttribute('aria-busy');}};
  document.getElementById('data-mode').textContent=`${repository.profile.name||repository.profile.email} · ${status}`;
  document.getElementById('novaMovimentacaoBtn').disabled=!data.farm||data.readOnly||!data.online;
  const content=document.getElementById('page-content');
  if(data.readOnly){const banner=document.createElement('div');banner.className='notice';const owner=repository.adminData?.farms.find(f=>f.id===data.farm.id);banner.innerHTML=`<p>Visualizando ${h(data.farm.name)} — proprietário ${h(owner?.owner_name||owner?.owner_email||'')} — modo administrador, somente consulta</p><button class="secondary-button" data-action="back-admin">Voltar para Administração</button>`;content.prepend(banner);}
  if(!repository.farms.length&&!data.readOnly&&page!=='administracao'){content.innerHTML=`<section class="panel empty-state"><h3>Você ainda não possui uma fazenda.</h3><button class="primary-button" data-action="new-farm">Criar primeira fazenda</button></section>`;return;}
  const canWrite=Boolean(data.farm&&!data.readOnly);
  if(!canWrite)content.querySelectorAll('[data-action]').forEach(b=>{if(/^(new-|edit-|delete-|quick-|farm-settings|change-mode|capacity-form|migrate-local|clear-local|start-empty|import-financial)/.test(b.dataset.action))b.hidden=true;});
  if(data.farm?.controlMode==='farm'){
    content.querySelectorAll('[name="pastureId"]').forEach(el=>el.closest('label')?.remove());
    content.querySelectorAll('option[value="Transferência de pasto"]').forEach(el=>el.remove());
  }
  if(page==='dashboard'){
    content.querySelector('.backup-bar').innerHTML='<div><strong>Uma cópia dos seus dados</strong><p>Exporte um backup para guardar os registros e as fotos.</p></div><button class="secondary-button" data-action="export-backup">Exportar backup</button>';
    const dist=content.querySelector('.dashboard-grid > .panel:first-child');
    if(data.scope===ALL_FARMS)dist.innerHTML=`<div class="panel-header"><div><h3>${repository.farms.length} fazendas</h3><p>Distribuição do rebanho</p></div></div><div class="pasture-list">${data.farms.map(f=>`<button class="farm-total" data-action="select-farm" data-id="${h(f.id)}"><span>${h(f.name)}</span><strong>${number(data.stock.filter(l=>l.farmId===f.id).reduce((s,l)=>s+l.quantity,0))}</strong></button>`).join('')}</div>`;
    else if(data.farm.controlMode==='farm')dist.innerHTML='<h3>Fazenda inteira</h3><p>O rebanho é controlado pelo estoque geral da propriedade.</p><a href="#evolucao" class="text-button">Ver evolução</a>';
    if(canWrite)content.querySelectorAll('.animal-card').forEach((el,i)=>el.insertAdjacentHTML('beforeend',quickButtons(CATEGORIES[i])));
    const extra=document.createElement('section');extra.className='cloud-summary';extra.innerHTML=`<section class="panel"><h3>Pendências · ${activeAlerts(data).length}</h3><p>${pending} movimentações aguardando sincronização</p><a href="#alertas" class="text-button">Ver pendências</a></section>${capacitySummary(data).map(c=>`<section class="panel capacity-card ${c.state}"><h3>${h(c.name)}</h3><strong>${number(c.heads)} / ${number(c.maxHeads)}</strong><p>${Math.round(c.percentage)}% · ${c.state==='exceeded'?'Excedida':c.state==='warning'?'Atenção':'Normal'}</p></section>`).join('')}<a href="#evolucao" class="panel text-button">Acompanhar evolução →</a>`;content.querySelector('.summary').after(extra);
    try{if(localStorage.getItem(STORAGE_KEY)&&!sessionStorage.getItem(`migration-dismiss:${repository.userId}`)){const notice=document.createElement('div');notice.className='notice';notice.innerHTML='<p>Encontramos dados da versão local.</p><button class="primary-button" data-action="migrate-local">Migrar dados</button><button class="text-button" data-action="dismiss-migration">Agora não</button>';content.prepend(notice);}}catch{}
  }
  if(page==='rebanho'&&canWrite)content.querySelectorAll('.category-strip > div').forEach((el,i)=>{if(i)el.insertAdjacentHTML('beforeend',quickButtons(CATEGORIES[i-1]));});
  if(page==='pastos'&&canWrite)content.querySelectorAll('.pasture-card').forEach((card,i)=>card.querySelectorAll('.category-list > div').forEach((row,j)=>row.insertAdjacentHTML('beforeend',quickButtons(CATEGORIES[j],data.pastures.filter(p=>!p.archived)[i].id))));
  if(page==='financeiro')content.querySelector('.notice,.migration-note')?.remove();
  if(page==='fotos')content.querySelector('.page-footnote').textContent='As fotos são privadas e ficam vinculadas à fazenda. Fotos de movimentações offline são enviadas ao sincronizar.';
  if(repository.lastError){const error=document.createElement('p');error.className='notice';error.textContent=repository.lastError;content.prepend(error);}
}
