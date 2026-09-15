import { rpc, serviceError, uploadPhoto } from '../supabase/client.js';
import { offlineDB } from '../offline/db.js';
import { createOutbox } from '../offline/outbox.js';
import { createSyncManager } from '../offline/syncManager.js';
import { isOnline, watchConnectivity } from '../offline/connectivity.js';
import { ALL_FARMS, mapRow, snapshotData, projectPending } from '../services/farmData.js';
import { validateQuickMovement } from '../services/quickMovement.js';
import { today } from '../utils.js';

export async function createCloudRepository(client, user, { db = offlineDB } = {}) {
  const userId=user.id, outbox=createOutbox(db,userId), listeners=new Set();
  let profile, farms=[], selected=ALL_FARMS, raw={farms:[]}, state, queue=[], uncertain=[], viewingAdmin=false, adminData=null, disposed=false, loading=false;
  let loadNumber=0;
  const preference=`controle-gado:farm:${userId}`;
  try { selected=localStorage.getItem(preference)||ALL_FARMS; } catch {}
  const emit=()=>{if(!disposed) for(const callback of listeners) callback();};
  const channel=globalThis.BroadcastChannel?new BroadcastChannel(`controle-gado:queue:${userId}`):null;
  if(channel)channel.onmessage=async()=>{queue=await outbox.list();emit();};
  const changed=async()=>{queue=await outbox.list();emit();channel?.postMessage('changed');};
  const cachedBootstrap=await db.get('kv',`bootstrap:${userId}`);
  async function bootstrap() {
    if (!isOnline()) {
      if(!cachedBootstrap) throw new Error('Conecte à internet para abrir esta conta pela primeira vez.');
      ({ profile,farms }=cachedBootstrap.value);return;
    }
    const [p,m]=await Promise.all([client.from('profiles').select('id,name,email,system_role,created_at').eq('id',userId).single(),client.from('farm_members').select('farm_id,farms(*)').eq('user_id',userId).limit(101)]);
    if(p.error||m.error) throw serviceError(p.error||m.error);
    if(m.data.length>100) throw new Error('Esta conta excede o limite de 100 fazendas por sessão.');
    profile=mapRow(p.data);farms=m.data.map(m=>mapRow(m.farms)).filter(f=>!f.archived);
    await db.put('kv',{id:`bootstrap:${userId}`,value:{profile,farms}});
  }
  await bootstrap();
  if(selected!==ALL_FARMS&&!farms.some(f=>f.id===selected)) selected=farms.length===1?farms[0].id:ALL_FARMS;
  const send=async(farmId,mutationId,action,payload)=>{
    if(disposed)throw new Error('A sessão foi encerrada. Entre novamente na mesma conta.');
    const session=await client.auth.getSession();
    if(session.data.session?.user.id!==userId)throw new Error('A conta mudou. Entre novamente na conta que criou esta operação.');
    if(action==='movement.value')return rpc(client,'complete_movement_value',{p_farm_id:farmId,p_mutation_id:mutationId,p_movement_id:payload.id,p_value_cents:payload.valueCents});
    return rpc(client,'farm_command',{p_farm_id:farmId,p_mutation_id:mutationId,p_action:action,p_payload:payload});
  };
  async function load() {
    const ticket=++loadNumber, scope=selected, admin=viewingAdmin;
    const ids=scope===ALL_FARMS?farms.map(f=>f.id):[scope];
    const cacheKey=`cache:${userId}:${scope}`;
    let snapshot;
    loading=true;
    try {
      if(isOnline()) {
        snapshot=await rpc(client,'farm_snapshot',{p_farm_ids:ids});
        if(!admin && JSON.stringify(snapshot).length<8*1024*1024) {
          await db.put('kv',{id:cacheKey,value:snapshot,savedAt:Date.now()});
          const indexKey=`cache-index:${userId}`,index=(await db.get('kv',indexKey))?.value||[];
          const recent=[scope,...index.filter(x=>x!==scope)];
          for(const old of recent.slice(5)) await db.remove('kv',`cache:${userId}:${old}`);
          await db.put('kv',{id:indexKey,value:recent.slice(0,5)});
        }
      } else {
        if(admin) throw new Error('A consulta administrativa precisa de internet.');
        const cached=await db.get('kv',cacheKey);
        if(!cached) throw new Error('Abra esta fazenda com internet antes de usá-la no campo.');
        snapshot=cached.value;
      }
      const next=snapshotData(snapshot,{userId,selected:scope,readOnly:admin});
      if(isOnline() && next.photos.length) {
        const signed=await client.storage.from('farm-photos').createSignedUrls(next.photos.map(p=>p.storagePath),3600);
        if(signed.error) throw serviceError(signed.error);
        next.photos=next.photos.map((p,i)=>({...p,image:signed.data[i]?.signedUrl||''}));
      }
      if(ticket!==loadNumber||disposed) return;
      raw=snapshot;state=next;queue=await outbox.list();
      uncertain=(await Promise.all(ids.map(id=>db.get('kv',`unconfirmed:${userId}:${id}`)))).filter(Boolean).map(r=>r.value);
      if(!admin) farms=farms.map(f=>next.farms.find(n=>n.id===f.id)||f);
      emit();
    } finally { if(ticket===loadNumber) loading=false; }
  }
  await load();
  function writable() {
    if(disposed||loading) throw new Error('Aguarde o carregamento da fazenda.');
    if(viewingAdmin) throw new Error('Esta fazenda está em modo de consulta.');
    if(selected===ALL_FARMS) throw new Error('Selecione uma fazenda antes de registrar.');
    if(!farms.some(f=>f.id===selected)) throw new Error('Fazenda sem acesso.');
    return selected;
  }
  async function command(action,payload,mutationId=crypto.randomUUID(),onStage=()=>{}) {
    const farmId=writable();
    if(!isOnline()) throw new Error('Para esta alteração, conecte à internet. No campo, use os botões + e −.');
    if(queue.some(r=>r.farmId===farmId&&!['synced','superseded'].includes(r.status))) throw new Error('Sincronize ou revise as movimentações pendentes desta fazenda antes de alterar outros registros.');
    const key=`unconfirmed:${userId}:${farmId}`,previous=(await db.get('kv',key))?.value;
    if(previous && JSON.stringify([previous.action,previous.payload])!==JSON.stringify([action,payload]))throw new Error('Há um registro aguardando confirmação. Abra Alertas e tente confirmar antes de fazer outra alteração.');
    const operation=previous||{farmId,action,payload,mutationId};
    await db.put('kv',{id:key,value:operation});
    uncertain=[...uncertain.filter(r=>r.farmId!==farmId),operation];
    let result;
    try { result=await send(farmId,operation.mutationId,action,payload); }
    catch(error){if(!error.retryable){await db.remove('kv',key);uncertain=uncertain.filter(r=>r.farmId!==farmId);}emit();throw error;}
    await db.remove('kv',key);uncertain=uncertain.filter(r=>r.farmId!==farmId);
    try{await onStage('Atualizando fazenda…');await load();}catch{repository.lastError='O registro foi salvo. Reconecte ou atualize a página para consultar os dados confirmados.';emit();}
    return result;
  }
  const manager=createSyncManager({outbox,db,userId,send,upload:(path,blob)=>uploadPhoto(client,path,blob),refresh:async()=>{if(isOnline()) await load();},changed,online:isOnline});
  const stopWatching=watchConnectivity(()=>{emit();if(isOnline()) manager.run().catch(error=>{repository.lastError=error.message;emit();});});
  const refreshTimer=setInterval(()=>{if(isOnline()&&!disposed&&!document.hidden&&!loading&&!manager.running&&!document.querySelector('#dialog[open]')) load().catch(error=>{repository.lastError=error.message;emit();});},60000);
  const repository={
    cloud:true,client,userId,outbox,manager,lastError:'',
    get profile(){return profile;},get farms(){return structuredClone(farms);},get selected(){return selected;},get adminData(){return adminData;},get loading(){return loading;},
    getData:()=>{if(!state)throw new Error('A fazenda está carregando.');return {...projectPending(state,queue),unconfirmed:structuredClone(uncertain),online:isOnline(),syncing:manager.running,adminData};},
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    async selectFarm(id,{admin=false}={}){
      if(!admin&&id!==ALL_FARMS&&!farms.some(f=>f.id===id))throw new Error('Fazenda sem acesso.');
      if(admin&&profile.systemRole!=='super_admin')throw new Error('Administração indisponível.');
      const old={selected,viewingAdmin};selected=id;viewingAdmin=admin;
      try{await load();if(!admin)try{localStorage.setItem(preference,id);}catch{}}
      catch(error){selected=old.selected;viewingAdmin=old.viewingAdmin;throw error;}
    },
    async createFarm({name,mode,openingDate=today(),id=crypto.randomUUID()}){
      if(!isOnline())throw new Error('Conecte à internet para criar uma fazenda.');
      await rpc(client,'create_farm',{p_id:id,p_name:name,p_mode:mode,p_opening_date:openingDate});
      await bootstrap();await repository.selectFarm(id);return id;
    },
    reload:load,command,
    async retryCommand(farmId){const record=await db.get('kv',`unconfirmed:${userId}:${farmId}`);if(!record)throw new Error('Não há registro aguardando confirmação.');await repository.selectFarm(farmId);return command(record.value.action,record.value.payload,record.value.mutationId);},
    async revisePending(id,quantity,note){
      if(!isOnline())throw new Error('Conecte à internet para revisar um conflito.');
      const revise=async()=>{
        const row=await db.get('outbox',id);if(!row||row.userId!==userId||row.status!=='failed')throw new Error('A pendência mudou. Atualize a página.');
        const check=await client.from('mutation_receipts').select('result').eq('farm_id',row.farmId).eq('user_id',userId).eq('client_mutation_id',row.clientMutationId).maybeSingle();
        if(check.error)throw serviceError(check.error);
        if(check.data){await outbox.complete(row);await load();await changed();return;}
        await repository.selectFarm(row.farmId);const nextId=crypto.randomUUID();
        const payload={...row.payload,id:nextId,quantity:Number(quantity),note:String(note||'').trim()};
        validateQuickMovement(repository.getData(),payload);
        if(payload.photo)payload.photo={...payload.photo,id:crypto.randomUUID(),description:payload.note,storagePath:`${row.farmId}/${userId}/${nextId}.jpg`};
        await outbox.replace(row,payload,nextId);await changed();
      };
      if(navigator.locks)await navigator.locks.request(`controle-gado:sync:${userId}`,revise);else await revise();
      await manager.run();
    },
    addMovement:input=>command('movement.save',movementPayload(input)),
    updateMovement:(id,input)=>command('movement.save',{...movementPayload(input),id}),
    deleteMovement:id=>command('movement.delete',{id}),
    completeMovementValue:(id,valueCents)=>command('movement.value',{id,valueCents}),
    savePasture:(id,name)=>{const pasture=state.pastures.find(p=>p.id===id);return command('pasture.save',{id:id||crypto.randomUUID(),name,description:pasture?.description||'',address:pasture?.address||''});},
    deletePasture:id=>command('pasture.archive',{id}),
    saveFinance:(id,input)=>command('finance.save',{...input,id:id||crypto.randomUUID()}),
    deleteFinance:id=>command('finance.delete',{id}),
    saveOwner:name=>command('owner.save',{name}),
    saveCapacity:input=>command('capacity.save',input),
    deleteCapacity:id=>command('capacity.delete',{id}),
    saveSettings:input=>command('farm.settings',input),
    changeMode:(mode,confirmed)=>command('farm.mode',{mode,confirmed}),
    alertStatus:(id,status)=>command('alert.status',{id,status}),
    async quickMovement(input,blob){
      const farmId=writable(),data=repository.getData();
      if(uncertain.some(r=>r.farmId===farmId))throw new Error('Confirme o registro pendente em Alertas antes de alterar o estoque.');
      const payload=movementPayload({...input,source:isOnline()?'quick_adjustment':'offline_quick_adjustment'});
      validateQuickMovement(data,payload);
      const id=crypto.randomUUID();payload.id=id;
      if(blob)payload.photo={id:crypto.randomUUID(),title:`${payload.type}: ${payload.category}`,description:payload.note,date:payload.date,pastureId:payload.pastureId,ownerId:payload.ownerId,storagePath:`${farmId}/${userId}/${id}.jpg`};
      const record=await outbox.enqueue({farmId,payload,blob,clientMutationId:id});await changed();
      if(isOnline()) manager.run().catch(error=>{repository.lastError=error.message;emit();});
      return {localId:record.id};
    },
    async savePhoto(id,input){
      const farmId=writable();if(!isOnline())throw new Error('Use uma movimentação rápida para registrar foto sem internet.');
      const current=state.photos.find(p=>p.id===id),photoId=id||crypto.randomUUID();
      let path=current?.storagePath;
      if(input.image?.startsWith('data:')){
        const blob=await (await fetch(input.image)).blob();path=`${farmId}/${userId}/${crypto.randomUUID()}.jpg`;await uploadPhoto(client,path,blob);
      }
      return command('photo.save',{id:photoId,title:input.title,description:input.description||'',date:input.date,pastureId:input.pastureId||'',ownerId:input.ownerId||'',storagePath:path});
    },
    deletePhoto:id=>command('photo.delete',{id}),
    async loadAdmin(){adminData=await rpc(client,'admin_overview',{});emit();return adminData;},
    async exportBackup(){const scope=selected;await load();if(scope!==selected)throw new Error('O contexto mudou. Exporte o backup novamente.');const {exportCloudBackup}=await import('../migration/cloudBackup.js');return exportCloudBackup(repository,raw);},
    async importLocal(content){const {importLocalData}=await import('../migration/localMigration.js');return importLocalData(repository,content);},
    dispose(){disposed=true;loadNumber++;manager.stop();channel?.close();stopWatching();clearInterval(refreshTimer);listeners.clear();state=null;raw=null;},
  };
  return repository;
}
export function movementPayload(input){return {type:input.type,category:input.category,quantity:Number(input.quantity),direction:Number(input.direction||1),pastureId:input.pastureId||'',destinationId:input.type==='Transferência de pasto'?input.destinationId||'':'',ownerId:input.ownerId||'',date:input.date,valueCents:Number(input.valueCents||0),note:String(input.note||'').trim(),source:input.source||'normal'};}
