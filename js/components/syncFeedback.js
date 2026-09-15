import { createButtonAction, isActionRunning } from './actionButton.js';
// Consultas de apresentação à fila existente. Nunca transforma falha em sucesso.
export function showSyncingButtons(root,data){
  for(const button of root.querySelectorAll('[data-action="retry-sync"]')){
    if(data.pendingSync.some(row=>row.id===button.dataset.id&&row.status==='syncing')&&!isActionRunning(button))createButtonAction(button).syncing();
  }
}
export async function syncOutcome(repository,id){
  const rows=await repository.outbox.list();
  const relevant=id?rows.filter(r=>r.id===id):rows;
  if(relevant.some(r=>r.status==='failed'))return {state:'error',label:'Revise as pendências'};
  if(relevant.some(r=>!['synced','superseded'].includes(r.status)))return {state:'offline',label:'Aguardando sincronização'};
  return {state:'success',label:'Sincronizado'};
}
