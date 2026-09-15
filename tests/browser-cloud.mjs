import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,readFile } from 'node:fs/promises';
import { snapshotData } from '../js/services/farmData.js';
import { stockAt } from '../js/services/evolution.js';
import { today } from '../js/utils.js';
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const uid='10000000-0000-0000-0000-000000000001',f1='20000000-0000-0000-0000-000000000001',f2='20000000-0000-0000-0000-000000000002';
const user={id:uid,email:'teste@example.invalid',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}};
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'},'test'].map((p,i)=>i===2?p:Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
const session={access_token:token,refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer',user};
let raw={farms:[{id:f1,name:'Fazenda A',control_mode:'farm',opening_date:'2026-01-01',capacity_enabled:true,revision:0,created_by:uid},{id:f2,name:'Fazenda B',control_mode:'pasture',opening_date:'2026-01-01',capacity_enabled:false,revision:0,created_by:uid}],owners:[],pastures:[{id:'40000000-0000-0000-0000-000000000002',farm_id:f2,name:'Serra',archived:false}],opening_stock:[{id:'50000000-0000-0000-0000-000000000001',farm_id:f1,category:'Vacas',quantity:79,owner_id:null,pasture_id:null},{id:'50000000-0000-0000-0000-000000000002',farm_id:f2,category:'Vacas',quantity:200,owner_id:null,pasture_id:'40000000-0000-0000-0000-000000000002'}],herd_stock:[],movements:[],finances:[],photos:[],alerts:[],capacity_rules:[{id:'60000000-0000-0000-0000-000000000001',farm_id:f1,year:Number(today().slice(0,4)),month:Number(today().slice(5,7)),max_heads:80,warning_percentage:90,active:true}],mode_changes:[]};
const snake=key=>key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
function refreshStock(){const projected=snapshotData(raw,{userId:uid});raw.herd_stock=stockAt(projected,today()).map(l=>Object.fromEntries(Object.entries(l).map(([k,v])=>[snake(k),v])));}
refreshStock();const receipts=new Set(),objects=new Map();let sequence=0;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'https://controle-gado-test.invalid',supabaseAnonKey:'test-public-key'};"}));
await context.route('https://controle-gado-test.invalid/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,body=request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null;
  const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(request.method()==='OPTIONS')return respond({});
  if(path==='/auth/v1/token')return respond(session);
  if(path==='/auth/v1/user'){
    const claims=JSON.parse(Buffer.from(request.headers().authorization.split(' ')[1].split('.')[1],'base64url'));
    return respond({...user,id:claims.sub});
  }
  if(path==='/auth/v1/logout')return respond({});
  if(path==='/rest/v1/profiles')return respond({id:url.searchParams.get('id')?.slice(3)||uid,name:'Teste',email:user.email,system_role:'user'});
  if(path==='/rest/v1/farm_members')return respond(url.searchParams.get('user_id')===`eq.${uid}`?raw.farms.map(f=>({farm_id:f.id,farms:f})):[]);
  if(path==='/rest/v1/rpc/farm_snapshot'){const result={};for(const [k,rows]of Object.entries(raw))result[k]=rows.filter(r=>body.p_farm_ids.includes(k==='farms'?r.id:r.farm_id));return respond(result);}
  if(path==='/rest/v1/rpc/create_farm'){if(!raw.farms.some(f=>f.id===body.p_id))raw.farms.push({id:body.p_id,name:body.p_name,control_mode:body.p_mode,opening_date:body.p_opening_date,capacity_enabled:false,created_by:uid,revision:0});return respond(body.p_id);}
  if(path==='/rest/v1/rpc/farm_command'){
    const {p_farm_id:farm,p_mutation_id:mutation,p_action:action,p_payload:p}=body;
    if(receipts.has(mutation))return respond({id:p.id||mutation});
    const previous=structuredClone(raw);
    if(action==='movement.save'){
      const existing=raw.movements.find(m=>m.id===p.id);raw.movements=raw.movements.filter(m=>m.id!==p.id);
      raw.movements.push({id:p.id||mutation,farm_id:farm,type:p.type,category:p.category,quantity:p.quantity,direction:p.direction,owner_id:p.ownerId||null,pasture_id:p.pastureId||null,destination_pasture_id:p.destinationId||null,date:p.date,value_cents:p.valueCents||null,note:p.note,source:p.source,created_at:new Date().toISOString(),sequence:existing?.sequence||++sequence,client_mutation_id:existing?.client_mutation_id||mutation});
      if(p.photo)raw.photos.push({id:p.photo.id,farm_id:farm,movement_id:p.id||mutation,storage_path:p.photo.storagePath,title:p.photo.title,description:p.photo.description,date:p.photo.date});
      refreshStock();
    }else if(action==='finance.save')raw.finances.push({...Object.fromEntries(Object.entries(p).map(([k,v])=>[snake(k),v])),farm_id:farm,source:'manual'});
    else if(action==='pasture.save')raw.pastures.push({id:p.id||mutation,farm_id:farm,name:p.name,archived:false});
    else if(action==='capacity.save'){const periodId=p.id||mutation;if(p.id)raw.capacity_rules=raw.capacity_rules.filter(r=>r.farm_id!==farm||(r.id!==p.id&&r.period_id!==p.id));for(let offset=0;offset<(p.months??1);offset++){const date=new Date(Date.UTC(p.year,p.month-1+offset,1)),year=date.getUTCFullYear(),month=date.getUTCMonth()+1;raw.capacity_rules=raw.capacity_rules.filter(r=>!(r.farm_id===farm&&r.year===year&&r.month===month&&(r.pasture_id||'')===(p.pastureId||'')));raw.capacity_rules.push({...Object.fromEntries(Object.entries(p).filter(([key])=>!['id','months'].includes(key)).map(([k,v])=>[snake(k),v])),year,month,id:`${mutation}-${offset}`,farm_id:farm,period_id:periodId,period_start_year:p.year,period_start_month:p.month,period_months:p.months??1});}}
    else if(action==='capacity.delete'){const size=raw.capacity_rules.length;raw.capacity_rules=raw.capacity_rules.filter(r=>r.farm_id!==farm||(r.id!==p.id&&r.period_id!==p.id));if(raw.capacity_rules.length===size){raw=previous;return respond({code:'P0001',message:'Capacidade não encontrada.'},400);}}
    else if(action==='farm.settings')Object.assign(raw.farms.find(f=>f.id===farm),{name:p.name,description:p.description,capacity_enabled:p.capacityEnabled});
    else if(action==='photo.save')raw.photos.push({...Object.fromEntries(Object.entries(p).map(([k,v])=>[snake(k),v])),farm_id:farm});
    else {raw=previous;return respond({code:'P0001',message:`Mock não implementa ${action}`},400);}
    receipts.add(mutation);return respond({id:p.id||mutation});
  }
  if(path==='/rest/v1/rpc/complete_movement_value'){
    const m=raw.movements.find(m=>m.farm_id===body.p_farm_id&&m.id===body.p_movement_id);
    if(!m)return respond({code:'P0001',message:'Movimentação não encontrada.'},400);
    m.value_cents=body.p_value_cents;receipts.add(body.p_mutation_id);return respond({id:m.id});
  }
  if(path.startsWith('/storage/v1/object/sign/farm-photos')&&request.method()==='POST')return respond(body.paths.map(p=>({path:p,signedURL:`/object/sign/farm-photos/${p}?token=test`})));
  if(path.startsWith('/storage/v1/object/farm-photos/')||path.startsWith('/storage/v1/object/sign/farm-photos/')){const key=decodeURIComponent(path.split('/farm-photos/')[1]);if(request.method()==='POST'){const form=await new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}).formData();objects.set(key,Buffer.from(await form.get('').arrayBuffer()));return respond({Key:key});}return route.fulfill({contentType:'image/jpeg',body:objects.get(key)||Buffer.alloc(0)});}
  return respond({message:`Rota não simulada: ${path}`},404);
});
const dialog=page.locator('#dialog'),submit=()=>dialog.locator('[type="submit"]').click();
const go=async route=>{await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(r=>document.querySelector('.menu-item.active')?.hash==='#'+r.split('?')[0],route);};
const total=async n=>{await go('dashboard');await page.waitForFunction(n=>document.querySelector('#totalRebanho')?.textContent===String(n),n);};
try{
  await page.goto(base);await page.locator('#login-form').waitFor();assert.equal(await page.locator('.main').isVisible(),false);
  await page.locator('[name="email"]').fill('teste@example.invalid');await page.locator('[name="password"]').fill('senha-de-teste');await page.locator('#login-form [type="submit"]').click();
  await total(279);assert.equal(await page.locator('.menu a[href="#administracao"]').count(),0);
  await page.locator('#farm-selector').selectOption(f1);await total(79);assert.equal(await page.locator('.menu a[href="#pastos"]').count(),0);
  await go('configuracoes');await page.locator('[data-action="capacity-form"]').click();const months=dialog.locator('[name="months"]');assert.equal(await months.getAttribute('min'),'1');assert.equal(await months.getAttribute('step'),'1');for(const invalid of ['0','-1','1.5']){await months.fill(invalid);assert.equal(await months.evaluate(el=>el.validity.valid),false);}await months.fill('3');assert.equal(await dialog.locator('#capacity-period-label').innerText(),'3 meses');await dialog.locator('[name="period"]').fill('2027-01');await dialog.locator('[name="maxHeads"]').fill('100');await submit();await dialog.waitFor({state:'hidden'});assert.deepEqual(raw.capacity_rules.filter(r=>r.farm_id===f1&&r.year===2027).map(r=>r.month),[1,2,3]);
  const capacityRows=page.locator('section').filter({has:page.getByRole('heading',{name:'Capacidades configuradas'})}).locator('tbody tr');assert.equal(await capacityRows.count(),2);assert.equal(await capacityRows.locator('[data-action="edit-capacity"]').count(),2);assert.equal(await capacityRows.locator('[data-action="delete-capacity"]').count(),2);assert.match(await capacityRows.filter({hasText:'01/2027'}).innerText(),/3 meses[\s\S]*03\/2027/);assert.match(await capacityRows.filter({hasText:`${today().slice(5,7)}\/${today().slice(0,4)}`}).innerText(),/1 mês/);const january=capacityRows.filter({hasText:'01/2027'});await january.getByRole('button',{name:'Editar'}).click();assert.equal(await dialog.getByRole('heading').innerText(),'Editar capacidade');assert.equal(await dialog.locator('[name="period"]').inputValue(),'2027-01');assert.equal(await dialog.locator('[name="months"]').inputValue(),'3');assert.equal(await dialog.locator('[name="maxHeads"]').inputValue(),'100');assert.equal(await dialog.locator('[name="warningPercentage"]').inputValue(),'90');assert.equal(await dialog.locator('[name="active"]').inputValue(),'true');await dialog.locator('[name="maxHeads"]').fill('0');assert.equal(await dialog.locator('[name="maxHeads"]').evaluate(el=>el.validity.valid),false);await dialog.locator('[name="warningPercentage"]').fill('101');assert.equal(await dialog.locator('[name="warningPercentage"]').evaluate(el=>el.validity.valid),false);await dialog.locator('[name="period"]').fill('2027-12');await dialog.locator('[name="months"]').fill('2');await dialog.locator('[name="maxHeads"]').fill('125');await dialog.locator('[name="warningPercentage"]').fill('85');await dialog.locator('[name="active"]').selectOption('false');await submit();await dialog.waitFor({state:'hidden'});assert.equal(await capacityRows.count(),2);assert.equal(raw.capacity_rules.filter(r=>r.period_id).length,2);assert.match(await capacityRows.filter({hasText:'12/2027'}).innerText(),/2 meses[\s\S]*01\/2028[\s\S]*125[\s\S]*85%[\s\S]*Desativada/);const editedRow=capacityRows.filter({hasText:'12/2027'}),beforeCancel=raw.capacity_rules.length;await editedRow.getByRole('button',{name:'Excluir'}).click();assert.match(await dialog.innerText(),/Excluir capacidade de 12\/2027, período de 2 meses, Fazenda inteira\?/);await dialog.locator('.cancel').click();assert.equal(raw.capacity_rules.length,beforeCancel);assert.equal(await capacityRows.filter({hasText:'12/2027'}).count(),1);await editedRow.getByRole('button',{name:'Excluir'}).click();await submit();await dialog.waitFor({state:'hidden'});assert.equal(raw.capacity_rules.length,1);assert.equal(await capacityRows.count(),1);assert.equal(await capacityRows.filter({hasText:'12/2027'}).count(),0);await total(79);
  await page.locator('[aria-label="Adicionar Vacas"]').click();assert.equal(await dialog.locator('[name="pastureId"]').count(),0);await dialog.locator('[name="quantity"]').fill('3');await submit();await dialog.locator('#capacity-confirm').waitFor({state:'visible'});assert.match(await dialog.innerText(),/Excesso: 2/);await submit();await dialog.waitFor({state:'hidden'});await total(82);await page.waitForFunction(()=>document.querySelector('.connectivity')?.textContent==='Sincronizado');
  await context.setOffline(true);
  await page.locator('[aria-label="Adicionar Bezerros"]').click();await dialog.locator('[name="quantity"]').fill('2');await dialog.locator('[name="photo"]').setInputFiles('assets/icon-192.png');await submit();if(await dialog.locator('#capacity-confirm').isVisible())await submit();await page.waitForFunction(()=>document.querySelector('#dialog [type="submit"]')?.dataset.buttonState==='offline');assert.match(await dialog.locator('[type="submit"]').innerText(),/salvos offline/i);await dialog.waitFor({state:'hidden'});await total(84);
  const stored=await page.evaluate(async uid=>{const {offlineDB}=await import('/js/offline/db.js');return{queue:await offlineDB.list('outbox',uid),blobs:(await offlineDB.list('blobs',uid)).length};},uid);assert.equal(stored.queue.filter(r=>r.status==='pending').length,1);assert.equal(stored.blobs,1);
  await go('alertas');assert.match(await page.locator('#page-content').innerText(),/aguardando sincronização/);
  await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('.connectivity')?.textContent==='Sincronizado');await total(84);assert.equal(objects.size,1);assert.equal(raw.photos.length,1);
  await context.setOffline(true);await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('.connectivity')?.textContent==='Sincronizado');assert.equal(raw.movements.length,2);assert.equal(new Set(raw.movements.map(m=>m.client_mutation_id)).size,2);
  assert.equal(await page.evaluate(async uid=>{const {offlineDB}=await import('/js/offline/db.js');return(await offlineDB.list('blobs',uid)).length;},uid),0);
  await page.locator('[aria-label="Retirar Vacas"]').click();await dialog.locator('[name="type"]').selectOption('Venda');await dialog.locator('[name="quantity"]').fill('8');await submit();await dialog.waitFor({state:'hidden'});await total(76);await page.waitForFunction(()=>document.querySelector('.connectivity')?.textContent==='Sincronizado');await go('alertas');await page.getByRole('button',{name:'Informar valor'}).click();await dialog.locator('[name="value"]').fill('800');await submit();await dialog.waitFor({state:'hidden'});
  await go('financeiro');assert.match(await page.locator('#page-content').innerText(),/800,00/);
  await page.locator('#farm-selector').selectOption(f2);await total(200);assert.equal(await page.locator('.menu a[href="#pastos"]').count(),1);await go('pastos');await page.locator('[aria-label="Adicionar Vacas"]').click();assert.equal(await dialog.locator('[name="pastureId"]').getAttribute('type'),'hidden');await dialog.locator('.cancel').click();
  await page.locator('#farm-selector').selectOption('ALL_FARMS');await total(276);await go('evolucao');assert.match(await page.locator('#page-content').innerText(),/Comparação entre fazendas/);
  await go('evolucao?period=custom&from=2026-02-30&to=2026-03-01');await page.getByText('Selecione um período válido, até hoje.').waitFor();await go('dashboard');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const route of ['dashboard','rebanho','movimentacoes','financeiro','alertas','fotos','relatorios','configuracoes','evolucao']){await go(route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} transborda em ${width}`);}}
  await mkdir('tests/artifacts',{recursive:true});await page.setViewportSize({width:390,height:844});await total(276);await page.screenshot({path:'tests/artifacts/cloud-mobile.png',fullPage:true});
  await go('configuracoes');const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export-backup"]').click();const download=await downloadPromise;await download.saveAs('tests/artifacts/cloud-backup.json');const backup=JSON.parse(await readFile('tests/artifacts/cloud-backup.json','utf8'));assert.equal(backup.farms.length,2);assert.ok(backup.farms[0].data.photos[0].image.startsWith('data:image/'));
  const otherId='10000000-0000-0000-0000-000000000002';
  const otherToken=[{alg:'HS256',typ:'JWT'},{sub:otherId,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'},'test'].map((p,i)=>i===2?p:Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.evaluate(async access_token=>{const {getSupabase}=await import('/js/supabase/client.js');const client=await getSupabase();void client.auth.setSession({access_token,refresh_token:'another-test-session'});},otherToken);
  await page.getByText('Você ainda não possui uma fazenda.').waitFor();
  assert.doesNotMatch(await page.locator('#page-content').innerText(),/Fazenda A|Fazenda B|276/);
  assert.equal(await page.locator('#farm-selector option').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS navegador cloud: login, troca de conta, contextos, capacidade, quick, IndexedDB, foto offline, reconexão, financeiro pendente, backup e responsividade. Supabase HTTP simulado; SQL validado separadamente.');
}finally{await browser.close();}
