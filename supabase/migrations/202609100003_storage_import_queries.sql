begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('farm-photos','farm-photos',false,1048576,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create function private.photo_farm(path text) returns uuid language plpgsql immutable set search_path='' as $$
begin return split_part(path,'/',1)::uuid; exception when invalid_text_representation then return null; end $$;
create policy farm_photos_read on storage.objects for select to authenticated using(bucket_id='farm-photos' and private.can_read(private.photo_farm(name)));
create policy farm_photos_insert on storage.objects for insert to authenticated with check(bucket_id='farm-photos' and private.is_member(private.photo_farm(name)) and split_part(name,'/',2)=auth.uid()::text);
-- Uploads são imutáveis. Retry usa o mesmo caminho e confirma que o objeto já existe.
create function private.save_photo(f uuid,p jsonb,m uuid) returns void language plpgsql set search_path='' as $$
declare path text:=p->>'storagePath'; photo_id uuid:=(p->>'id')::uuid;
begin
 if private.photo_farm(path) is distinct from f or split_part(path,'/',2)<>auth.uid()::text then raise exception 'Referência de foto inválida.'; end if;
 if (p->>'date')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data da foto inválida.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='farm-photos' and name=path) then raise exception 'A foto ainda não foi enviada. Tente sincronizar novamente.'; end if;
 insert into public.photos(id,farm_id,pasture_id,owner_id,movement_id,title,description,date,storage_path,created_by)
 values(photo_id,f,nullif(p->>'pastureId','')::uuid,nullif(p->>'ownerId','')::uuid,m,p->>'title',coalesce(p->>'description',''),(p->>'date')::date,path,auth.uid())
 on conflict(id) do update set title=excluded.title,description=excluded.description,date=excluded.date,pasture_id=excluded.pasture_id,owner_id=excluded.owner_id,storage_path=excluded.storage_path where public.photos.farm_id=f;
 if not found then raise exception 'Foto de outra fazenda.'; end if;
end $$;

create function private.import_farm(f uuid,p jsonb) returns void language plpgsql set search_path='' as $$
declare r jsonb; fp text:=p->>'fingerprint'; total bigint; income numeric; expense numeric;
begin
 if fp is null or fp !~ '^[a-f0-9]{64}$' then raise exception 'Identificação da importação inválida.'; end if;
 if exists(select 1 from public.imports where farm_id=f and fingerprint=fp) then return; end if;
 if exists(select 1 from public.movements where farm_id=f) or exists(select 1 from public.opening_stock where farm_id=f) or exists(select 1 from public.finances where farm_id=f) or exists(select 1 from public.pastures where farm_id=f) or exists(select 1 from public.photos where farm_id=f) or exists(select 1 from public.owners where farm_id=f) then raise exception 'Escolha uma fazenda vazia para preservar os registros existentes.'; end if;
 if (p->>'openingDate')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data inicial inválida.'; end if;
 update public.farms set opening_date=(p->>'openingDate')::date,control_mode=p->>'controlMode',capacity_enabled=coalesce((p->>'capacityEnabled')::boolean,false) where id=f;
 for r in select value from jsonb_array_elements(p->'owners') loop
  insert into public.owners(id,farm_id,name) values((r->>'id')::uuid,f,r->>'name');
 end loop;
 for r in select value from jsonb_array_elements(p->'pastures') loop
  insert into public.pastures(id,farm_id,name,description,address,archived) values((r->>'id')::uuid,f,r->>'name',coalesce(r->>'description',''),coalesce(r->>'address',''),(r->>'archived')::boolean);
 end loop;
 for r in select value from jsonb_array_elements(p->'openingStock') loop
  insert into public.opening_stock(id,farm_id,pasture_id,owner_id,category,quantity) values((r->>'id')::uuid,f,nullif(r->>'pastureId','')::uuid,nullif(r->>'ownerId','')::uuid,r->>'category',(r->>'quantity')::bigint);
 end loop;
 for r in select value from jsonb_array_elements(p->'movements') loop
  if (r->>'date')::date not between (p->>'openingDate')::date and (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data inválida no histórico.'; end if;
  insert into public.movements(id,farm_id,type,category,quantity,direction,pasture_id,destination_pasture_id,owner_id,date,value_cents,note,source,created_by,created_at,sequence,client_mutation_id)
  values((r->>'id')::uuid,f,r->>'type',r->>'category',(r->>'quantity')::bigint,coalesce((r->>'direction')::smallint,1),nullif(r->>'pastureId','')::uuid,nullif(r->>'destinationId','')::uuid,nullif(r->>'ownerId','')::uuid,(r->>'date')::date,nullif((r->>'valueCents')::bigint,0),coalesce(r->>'note',''),coalesce(r->>'source','migration'),auth.uid(),coalesce((r->>'createdAt')::timestamptz,now()),(r->>'sequence')::bigint,(r->>'id')::uuid);
 end loop;
 -- A sequência global continua acima dos números importados; nunca retrocede.
 perform setval(pg_get_serial_sequence('public.movements','sequence'),greatest(nextval(pg_get_serial_sequence('public.movements','sequence')),coalesce((select max(sequence)+1 from public.movements),1)),false);
 for r in select value from jsonb_array_elements(coalesce(p->'modeChanges','[]')) loop
  insert into public.mode_changes(id,farm_id,mode,date,sequence,created_by) values((r->>'id')::uuid,f,r->>'mode',(r->>'date')::date,(r->>'sequence')::bigint,auth.uid());
 end loop;
 for r in select value from jsonb_array_elements(p->'finances') loop
  if r->>'source' not in ('manual','migration') then raise exception 'Origem financeira inválida.'; end if;
  if nullif(r->>'date','')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data financeira inválida.'; end if;
  insert into public.finances(id,farm_id,type,category,value_cents,date,description,source,owner_id,owner,property,notes,provenance,created_by,created_at)
  values((r->>'id')::uuid,f,r->>'type',r->>'category',(r->>'valueCents')::bigint,nullif(r->>'date','')::date,r->>'description',r->>'source',nullif(r->>'ownerId','')::uuid,coalesce(r->>'owner',''),coalesce(r->>'property',''),coalesce(r->>'notes',''),r->'provenance',auth.uid(),(r->>'createdAt')::timestamptz);
 end loop;
 insert into public.finances(farm_id,type,category,value_cents,date,description,source,movement_id,owner_id,notes,created_by,created_at)
 select f,case when type='Venda' then 'Entrada' else 'Despesa' end,case when type='Venda' then 'Venda de gado' else 'Compra de gado' end,value_cents,date,type||': '||quantity||' '||category,case when type='Venda' then 'cattle_sale' else 'cattle_purchase' end,id,owner_id,note,auth.uid(),created_at from public.movements where farm_id=f and value_cents is not null and type in ('Compra','Venda');
 for r in select value from jsonb_array_elements(coalesce(p->'capacityRules','[]')) loop
  insert into public.capacity_rules(id,farm_id,pasture_id,year,month,max_heads,warning_percentage,active) values((r->>'id')::uuid,f,nullif(r->>'pastureId','')::uuid,(r->>'year')::int,(r->>'month')::int,(r->>'maxHeads')::bigint,(r->>'warningPercentage')::int,(r->>'active')::boolean);
 end loop;
 for r in select value from jsonb_array_elements(p->'photos') loop perform private.save_photo(f,r,nullif(r->>'movementId','')::uuid); end loop;
 perform private.rebuild_stock(f);
 select coalesce(sum(quantity),0) into total from public.herd_stock where farm_id=f;
 select coalesce(sum(value_cents) filter(where type='Entrada'),0),coalesce(sum(value_cents) filter(where type='Despesa'),0) into income,expense from public.finances where farm_id=f;
 if total is distinct from (p->'totals'->>'heads')::bigint or income is distinct from (p->'totals'->>'income')::numeric or expense is distinct from (p->'totals'->>'expense')::numeric then raise exception 'Os totais da migração não conferem. Nenhum registro foi importado.'; end if;
 insert into public.imports(farm_id,fingerprint,created_by) values(f,fp,auth.uid());
end $$;

create function public.farm_snapshot(p_farm_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; t text; rows jsonb;
begin
 if auth.uid() is null or cardinality(p_farm_ids)>100 then raise exception 'Selecione até 100 fazendas acessíveis.'; end if;
 if exists(select 1 from unnest(p_farm_ids) f where not private.can_read(f)) then raise exception 'Fazenda sem acesso.' using errcode='42501'; end if;
 result:=jsonb_build_object('farms',(select coalesce(jsonb_agg(f),'[]') from public.farms f where id=any(p_farm_ids)));
 foreach t in array array['owners','pastures','opening_stock','herd_stock','movements','mode_changes','finances','capacity_rules','alerts','photos','imports'] loop
  execute format('select coalesce(jsonb_agg(r),''[]'') from (select * from public.%I where farm_id=any($1) limit 20001) r',t) into rows using p_farm_ids;
  if jsonb_array_length(rows)>20000 then raise exception 'Este recorte excede 20 mil registros. Selecione uma fazenda.'; end if;
  result:=result||jsonb_build_object(t,rows);
 end loop;
 return result;
end $$;
create function public.admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Acesso restrito à administração.' using errcode='42501'; end if;
 return jsonb_build_object(
 'users',(select coalesce(jsonb_agg(r),'[]') from (select p.id,p.name,p.email,p.created_at,(select count(*) from public.farm_members m where m.user_id=p.id) farms,(select coalesce(sum(s.quantity),0) from public.herd_stock s where exists(select 1 from public.farm_members m where m.farm_id=s.farm_id and m.user_id=p.id)) heads from public.profiles p order by p.created_at desc limit 500) r),
 'farms',(select coalesce(jsonb_agg(r),'[]') from (select f.*,p.name owner_name,p.email owner_email,(select coalesce(sum(quantity),0) from public.herd_stock where farm_id=f.id) heads from public.farms f join public.profiles p on p.id=f.created_by order by f.created_at desc limit 500) r),
 'activity',(select coalesce(jsonb_agg(r),'[]') from (select m.id,m.farm_id,f.name farm_name,m.type,m.category,m.quantity,m.date,m.created_at from public.movements m join public.farms f on f.id=m.farm_id order by m.created_at desc limit 100) r),
 'totals',jsonb_build_object('users',(select count(*) from public.profiles),'farms',(select count(*) from public.farms),'activeFarms',(select count(*) from public.farms where not archived),'heads',(select coalesce(sum(quantity),0) from public.herd_stock),'movements30Days',(select count(*) from public.movements where date>=current_date-30))
 );
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin(),private.is_member(uuid),private.can_read(uuid),private.photo_farm(text) to authenticated;
revoke all on function public.farm_snapshot(uuid[]),public.admin_overview() from public,anon;
grant execute on function public.farm_snapshot(uuid[]),public.admin_overview() to authenticated;
commit;
