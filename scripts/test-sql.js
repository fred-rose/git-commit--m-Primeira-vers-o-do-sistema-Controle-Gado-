import { spawn,spawnSync } from 'node:child_process';
import { existsSync,mkdirSync,readdirSync,readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { prepareImport } from '../js/migration/localMigration.js';
import { createSeed } from '../js/seed.js';
const bin=process.env.PG_BIN || (process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'/usr/bin');
const executable=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
const data=resolve('tests/pg-data'),port=process.env.TEST_PG_PORT||'55439';
function run(name,args,input){const r=spawnSync(executable(name),args,{input,encoding:'utf8',windowsHide:true,maxBuffer:5*1024*1024});if(r.status!==0)throw new Error(`${name}: ${r.stderr||r.stdout||r.error}`);return r.stdout;}
mkdirSync(resolve('tests'),{recursive:true});
if(!existsSync(join(data,'PG_VERSION')))run('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C']);
const processHandle=spawn(executable('postgres'),['-D',data,'-p',port,'-h','127.0.0.1'],{windowsHide:true,stdio:'ignore'});
const connection=['-h','127.0.0.1','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-X'];
const database=`controle_gado_test_${Date.now()}`;
try{
  let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,250));try{run('pg_isready',['-h','127.0.0.1','-p',port]);ready=true;break;}catch{}}
  if(!ready)throw new Error('PostgreSQL de teste não iniciou.');
  run('psql',[...connection,'-d','postgres','-c',`create database ${database}`]);
  const bootstrap=`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`;
  run('psql',[...connection,'-d',database],bootstrap);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())run('psql',[...connection,'-d',database],readFileSync(`supabase/migrations/${file}`,'utf8'));
  for(const file of readdirSync('supabase/tests').filter(f=>f.endsWith('.sql')).sort()){
    const acceptance=run('psql',[...connection,'-d',database],readFileSync(`supabase/tests/${file}`,'utf8'));
    process.stdout.write(acceptance.split('\n').filter(l=>l.includes('PASS:')).join('\n')+'\n');
  }
  const source=createSeed();source.photos=[{id:'legacy-photo',title:'Foto de teste',description:'Preservada',date:'2026-06-01',image:'data:image/png;base64,YQ==',pastureId:'pasture-unassigned',ownerId:'owner-unassigned'}];
  const farmId='20000000-0000-0000-0000-000000000099',userId='10000000-0000-0000-0000-000000000099';
  const {payload}=await prepareImport(source,farmId,userId);
  const literal=text=>"'"+text.replaceAll("'","''")+"'";
  const migrationSQL=`begin;insert into auth.users(id,email)values('${userId}','migration@test.invalid');set role authenticated;select set_config('request.jwt.claim.sub','${userId}',true);
select public.create_farm('${farmId}','Migração real','pasture','2026-05-28');
insert into storage.objects(bucket_id,name)values('farm-photos',${literal(payload.photos[0].storagePath)});
select public.farm_command('${farmId}','30000000-0000-0000-0000-000000000099','import',${literal(JSON.stringify(payload))}::jsonb);
select public.farm_command('${farmId}','30000000-0000-0000-0000-000000000099','import',${literal(JSON.stringify(payload))}::jsonb);
do $$begin
if(select sum(quantity)from public.herd_stock)<>169 or(select count(*)from public.finances)<>44 or(select count(*)from public.photos)<>1 or(select count(*)from public.imports)<>1 then raise exception 'FAIL migração idempotente';end if;
if(select sum(value_cents)from public.finances where type='Entrada')<>17657002 or(select sum(value_cents)from public.finances where type='Despesa')<>11808421 then raise exception 'FAIL financeiro migrado';end if;
if not exists(select 1 from public.pastures where address<>'') then raise exception 'FAIL endereços';end if;
if jsonb_array_length(public.farm_snapshot(array['${farmId}'::uuid])->'photos')<>1 then raise exception 'FAIL foto no snapshot';end if;
end $$;rollback;select 'PASS: migração dos 169 animais, 44 lançamentos, endereços e foto, sem duplicidade';`;
  const migrationResult=run('psql',[...connection,'-d',database],migrationSQL);
  process.stdout.write(migrationResult.split('\n').filter(l=>l.includes('PASS:')).join('\n')+'\n');
  process.stdout.write(`Migrations e testes SQL aprovados em PostgreSQL local (${database}). Auth/Storage usam schemas de teste; OAuth e upload HTTP exigem Supabase real.\n`);
}finally{
  try{run('pg_ctl',['-D',data,'-m','fast','stop']);}catch{}
  processHandle.kill();
}
