import { snapshotData } from '../services/farmData.js';
import { importDataset,mappedId,digest,readLocal } from './localMigration.js';
import { openModal } from '../components/modal.js';
import { inputField } from '../components/ui.js';
import { escapeHtml as h } from '../utils.js';
import { stockAt } from '../services/evolution.js';
import { validateTree } from '../storage/schema.js';
import { offlineDB } from '../offline/db.js';
import { nextPaint } from '../components/actionButton.js';
export async function exportCloudBackup(repository,raw){
  if(repository.getData().readOnly)throw new Error('O backup está disponível somente para suas próprias fazendas.');
  if(!navigator.onLine)throw new Error('Conecte à internet para incluir as fotos no backup completo.');
  const own=new Set(repository.farms.map(f=>f.id)),farms=[];
  for(const farm of raw.farms){
    if(!own.has(farm.id))throw new Error('O backup contém uma fazenda sem vínculo com sua conta.');
    const data=snapshotData(raw,{userId:repository.userId,selected:farm.id});
    for(const p of data.photos){const result=await repository.client.storage.from('farm-photos').download(p.storagePath);if(result.error)throw new Error('Não foi possível incluir todas as fotos. Tente o backup novamente.');p.image=await blobDataURL(result.data);delete p.storagePath;}
    for(const key of ['userId','readOnly','pendingSync','adminData'])delete data[key];
    farms.push({name:farm.name,data});
  }
  const pending=[];
  for(const row of await repository.outbox.list())if(!['synced','superseded'].includes(row.status)&&farms.some(f=>f.data.farm.id===row.farmId)){
    const blob=await offlineDB.get('blobs',row.id);pending.push({...row,...(blob?{image:await blobDataURL(blob.blob)}:{})});
  }
  return JSON.stringify({_meta:{system:'controle-gado',kind:'multifarm',schemaVersion:3,appVersion:'2.0.0',exportedAt:new Date().toISOString()},farms,pending},null,2);
}
export function blobDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
export function inspectCloudBackup(text){
  if(new TextEncoder().encode(text).byteLength>100*1024*1024)throw new Error('Escolha um backup de até 100 MB.');
  const parsed=JSON.parse(text);
  if(parsed._meta?.system!=='controle-gado'||parsed._meta?.kind!=='multifarm'||parsed._meta?.schemaVersion!==3||!Array.isArray(parsed.farms)||parsed.farms.length>100)throw new Error('Backup multifazenda inválido.');
  // Validação estrutural por fazenda evita que identidades de conta virem autorização.
  const ids=new Set();
  for(const entry of parsed.farms){
    const data=entry.data;if(!data?.farm?.id||ids.has(data.farm.id))throw new Error('Fazenda inválida ou repetida no backup.');ids.add(data.farm.id);
    validateTree({...data,photos:data.photos.map(p=>({...p,image:''}))});
    for(const collection of ['owners','pastures','openingStock','movements','finances','photos','capacityRules','modeChanges']){
      if(!Array.isArray(data[collection])||data[collection].some(r=>r.farmId!==data.farm.id))throw new Error('Há registros de outra fazenda no backup.');
    }
    data.cloud=true;data.farms=[data.farm];data.stock=stockAt(data,'9999-12-31');
  }
  return parsed;
}
export async function cloudImportDialog(repository,file){
  if(!file)return;if(file.size>100*1024*1024)throw new Error('Escolha um backup de até 100 MB.');
  const content=await file.text(),parsed=JSON.parse(content);
  if(parsed._meta?.kind!=='multifarm'){
    const data=readLocal(content);const id=crypto.randomUUID();
    return openModal({feedback:{loading:'Restaurando…',success:'Restaurado',error:'Restauração não concluída'},title:'Restaurar backup local',content:`<p>Uma fazenda separada receberá os registros. Seus dados atuais serão mantidos.</p>${inputField('name','Nome da fazenda','','text','required maxlength="100"')}`,submit:async (v,form,action)=>{const stage=async label=>{action.step(label);await nextPaint();};await repository.createFarm({id,name:v.get('name'),mode:data.pastures.length?'pasture':'farm',openingDate:data.openingDate});await importDataset(repository,data,stage);}});
  }
  const backup=inspectCloudBackup(content),fingerprint=await digest(content);
  if(backup.pending?.length)throw new Error('Este backup contém movimentações ainda pendentes. Sincronize no dispositivo de origem e exporte novamente; o arquivo atual preserva as pendências e fotos para recuperação manual.');
  openModal({feedback:{loading:'Restaurando…',success:'Restaurado',error:'Restauração não concluída'},title:'Restaurar fazendas',submitLabel:'Criar e restaurar',content:`<p>Serão restauradas ${backup.farms.length} fazendas separadas. As fazendas atuais serão mantidas.</p><ul>${backup.farms.map(f=>`<li>${h(f.name)} · ${f.data.movements.length} movimentações · ${f.data.photos.length} fotos</li>`).join('')}</ul><p>Se a conexão cair, importar este mesmo arquivo novamente retoma sem duplicar fazendas concluídas.</p>`,submit:async(values,form,action)=>{
    const stage=async label=>{action.step(label);await nextPaint();};
    for(const entry of backup.farms){await stage('Preparando fazenda…');const id=await mappedId(repository.userId,`${fingerprint}:${entry.data.farm.id}`);await repository.createFarm({id,name:entry.name,mode:entry.data.farm.controlMode,openingDate:entry.data.openingDate});await importDataset(repository,entry.data,stage);}
  }});
}
