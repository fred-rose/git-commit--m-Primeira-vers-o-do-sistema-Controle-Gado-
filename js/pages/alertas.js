import { activeAlerts } from '../capacity/alertsService.js';
import { pageHeading,button,emptyState } from '../components/ui.js';
import { escapeHtml as h } from '../utils.js';
export function render(data){
  const alerts=activeAlerts(data);
  return `${pageHeading('Alertas e pendências','Confira o que precisa de atenção na fazenda.',data.cloud?button('Sincronizar agora','sync-now'):'')}${alerts.map(a=>`<section class="panel alert-card ${a.severity}"><h3>${h(a.title)}</h3><p>${h(a.message)}</p>${a.farmId?`<small>${h(data.farms.find(f=>f.id===a.farmId)?.name||'')}</small>`:''}<div class="row-actions">${!data.readOnly&&a.unconfirmed?button('Confirmar registro','retry-command',a.farmId):''}${!data.readOnly&&a.movementId?button('Informar valor','complete-value',JSON.stringify({farmId:a.farmId,id:a.movementId})):''}${!data.readOnly&&a.local?button('Tentar novamente','retry-sync',a.id):''}${!data.readOnly&&a.failed?button('Revisar','review-sync',a.id):''}${!data.readOnly&&a.id&&!a.local?button('Ignorar aviso','ignore-alert',JSON.stringify({farmId:a.farmId,id:a.id})):''}</div></section>`).join('')||emptyState('Nenhum alerta pendente.','Todas as alterações estão sincronizadas.')}`;
}
