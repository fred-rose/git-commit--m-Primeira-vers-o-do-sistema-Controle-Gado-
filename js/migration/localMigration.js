import { inspectBackup } from '../storage/backup.js';
import { validateData,summarize } from '../domain.js';
import { upgradeData } from '../storage/migrations.js';
import { STORAGE_KEY } from '../constants.js';
import { uploadPhoto } from '../supabase/client.js';
import { stockAt } from '../services/evolution.js';
import { openModal } from '../components/modal.js';
import { inputField } from '../components/ui.js';
import { escapeHtml as h,download,today,money } from '../utils.js';
import { nextPaint } from '../components/actionButton.js';

export async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function mappedId(namespace,value){const hex=await digest(`${namespace}:${value}`);return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
export function readLocal(content){
  const parsed=JSON.parse(content);
  return parsed._meta?inspectBackup(content).data:validateData(upgradeData(parsed));
}
export async function prepareImport(data,farmId,userId){
  const fingerprint=await digest(JSON.stringify(data));
  const map=new Map();
  for(const collection of ['owners','pastures','openingStock','movements','finances','photos','capacityRules','modeChanges'])for(const r of data[collection]||[])map.set(r.id,await mappedId(`${farmId}:${fingerprint}`,`${collection}:${r.id}`));
  const reference=value=>value?map.get(value)||(()=>{throw new Error('O backup contém um vínculo sem registro correspondente.');})():'';
  const rows=collection=>(data[collection]||[]).map(r=>{
    const result={...r,id:map.get(r.id)};delete result.farmId;delete result.image;delete result.storagePath;
    for(const key of ['ownerId','pastureId','destinationId','movementId'])if(key in r)result[key]=reference(r[key]);
    return result;
  });
  const stats=summarize(data);
  const payload={fingerprint,openingDate:data.openingDate,controlMode:data.farm?.controlMode||(data.pastures.length?'pasture':'farm'),capacityEnabled:data.farm?.capacityEnabled||false,
    owners:rows('owners'),pastures:rows('pastures'),openingStock:rows('openingStock'),movements:rows('movements'),finances:rows('finances'),photos:rows('photos'),capacityRules:rows('capacityRules'),modeChanges:rows('modeChanges'),totals:{heads:stats.total,income:stats.financial.income,expense:stats.financial.expense}};
  const uploads=[];
  for(let i=0;i<payload.photos.length;i++){
    const original=data.photos[i];
    if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(original.image||'')||original.image.length>1400000)throw new Error('O backup precisa conter as imagens completas em JPG, PNG ou WebP.');
    const photo=payload.photos[i];photo.storagePath=`${farmId}/${userId}/import-${photo.id}.jpg`;
    uploads.push({path:photo.storagePath,image:original.image});
  }
  return {payload,uploads};
}
export async function importLocalData(repository,content){return importDataset(repository,readLocal(content));}
export async function importDataset(repository,data,onStage=()=>{}){
  const current=repository.getData();if(!current.farm||current.readOnly)throw new Error('Selecione uma fazenda vazia para receber os dados.');
  await onStage('Preparando dados…');
  const {payload,uploads}=await prepareImport(data,current.farm.id,repository.userId);
  for(const [index,photo] of uploads.entries()){await onStage(`Enviando foto ${index+1} de ${uploads.length}…`);await uploadPhoto(repository.client,photo.path,await (await fetch(photo.image)).blob());}
  await onStage('Migrando dados…');
  try {
    return await repository.command('import',payload,await mappedId(current.farm.id,payload.fingerprint),onStage);
  } catch(error) {
    // A decisão continua no servidor, inclusive em retomadas idempotentes.
    if(error.code==='P0001'&&/fazenda vazia/i.test(error.message)){
      const counts=[['movements','movimentação','movimentações'],['openingStock','lote de estoque inicial','lotes de estoque inicial'],['finances','lançamento financeiro','lançamentos financeiros'],['pastures','pasto','pastos'],['photos','foto','fotos'],['owners','proprietário','proprietários']]
        .map(([key,singular,plural])=>{const count=(current[key]||[]).filter(row=>!row.farmId||row.farmId===current.farm.id).length;return count?`${count} ${count===1?singular:plural}`:'';}).filter(Boolean);
      error.message=`Não foi possível migrar porque esta fazenda já possui dados.${counts.length?` Nos dados carregados, encontramos ${counts.join(', ')}.`:''} Exclua os registros de teste ou escolha outra fazenda vazia.`;
    }
    throw error;
  }
}
export function migrationDialog(repository){
  const content=localStorage.getItem(STORAGE_KEY);if(!content)throw new Error('Nenhum dado da versão local foi encontrado neste endereço.');
  const data=readLocal(content),summary=summarize(data),target=repository.getData().farm;
  const targetId=crypto.randomUUID();
  openModal({feedback:{loading:'Exportando cópia…',success:'Migração concluída',error:'Migração não concluída'},title:'Migrar dados locais',submitLabel:'Exportar cópia e migrar',content:`<p>${summary.total} cabeças · ${data.movements.length} movimentações · ${data.pastures.length} pastos · ${data.photos.length} fotos.</p><p>Entradas: ${money(summary.financial.income)} · Despesas: ${money(summary.financial.expense)}.</p><p>A cópia deste navegador será mantida. O servidor confere os totais e importa em uma única transação.</p>${target?`<p>Destino: <strong>${h(target.name)}</strong>. A fazenda deve estar vazia.</p>`:inputField('name','Nome da fazenda de destino','','text','required maxlength="100"')}`,submit:async (values,form,action)=>{
    download(`controle-gado-antes-migracao-${today()}.json`,content);
    const stage=async label=>{action.step(label);await nextPaint();};
    await stage('Preparando fazenda…');
    if(!target)await repository.createFarm({id:targetId,name:values.get('name'),mode:data.pastures.length?'pasture':'farm',openingDate:data.openingDate});
    else if(repository.selected!==target.id)throw new Error('O contexto mudou. Abra a migração novamente.');
    await importDataset(repository,data,stage);sessionStorage.setItem(`migration-dismiss:${repository.userId}`,'true');
  }});
}
