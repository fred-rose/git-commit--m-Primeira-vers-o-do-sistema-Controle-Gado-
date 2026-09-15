begin;
create function private.delta(f uuid,p uuid,o uuid,c text,q bigint) returns void language plpgsql set search_path='' as $$
begin
 insert into public.herd_stock(farm_id,pasture_id,owner_id,category,quantity) values(f,p,o,c,0) on conflict do nothing;
 if exists(select 1 from public.herd_stock where farm_id=f and pasture_id is not distinct from p and owner_id is not distinct from o and category=c and quantity+q<0) then
  raise exception 'Não foi possível concluir: estoque insuficiente na data. Revise a movimentação.' using errcode='P0001';
 end if;
 update public.herd_stock set quantity=quantity+q,updated_at=now() where farm_id=f and pasture_id is not distinct from p and owner_id is not distinct from o and category=c;
end $$;
create function private.rebuild_stock(f uuid) returns void language plpgsql set search_path='' as $$
declare r record; s record;
begin
 delete from public.herd_stock where farm_id=f;
 for r in select * from public.opening_stock where farm_id=f loop perform private.delta(f,r.pasture_id,r.owner_id,r.category,r.quantity); end loop;
 for r in select date,sequence,id,false as mode_event from public.movements where farm_id=f
          union all select date,sequence,id,true from public.mode_changes where farm_id=f order by date,sequence,mode_event loop
  if r.mode_event then
   if (select mode from public.mode_changes where id=r.id)='farm' then
    for s in select owner_id,category,sum(quantity)::bigint quantity from public.herd_stock where farm_id=f group by owner_id,category loop
     delete from public.herd_stock where farm_id=f and owner_id is not distinct from s.owner_id and category=s.category;
     perform private.delta(f,null,s.owner_id,s.category,s.quantity);
    end loop;
   end if;
  else
   select * into s from public.movements where id=r.id;
   perform private.delta(f,s.pasture_id,s.owner_id,s.category,s.quantity * case when s.type in ('Venda','Morte','Saída','Transferência de pasto') then -1 when s.type='Ajuste de contagem' then s.direction else 1 end);
   if s.type='Transferência de pasto' then perform private.delta(f,s.destination_pasture_id,s.owner_id,s.category,s.quantity); end if;
  end if;
 end loop;
 delete from public.herd_stock where farm_id=f and quantity=0;
 if exists(select 1 from public.herd_stock stock_row join public.pastures pasture_row on pasture_row.id=stock_row.pasture_id where stock_row.farm_id=f and pasture_row.archived) then raise exception 'Um pasto arquivado não pode conter animais.'; end if;
 if (select control_mode from public.farms where id=f)='farm' and exists(select 1 from public.herd_stock where farm_id=f and pasture_id is not null) then raise exception 'O estoque deve estar consolidado na fazenda.'; end if;
end $$;
create function private.refresh_alerts(f uuid) returns void language plpgsql set search_path='' as $$
declare r record; heads bigint; exceeded boolean; key text; d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 update public.alerts set status='resolved',resolved_at=now() where farm_id=f and type in ('capacity_warning','capacity_exceeded') and status='pending';
 if (select capacity_enabled from public.farms where id=f) then
  for r in select c.* from public.capacity_rules c join public.farms farm on farm.id=c.farm_id where c.farm_id=f and c.active and c.year=extract(year from d) and c.month=extract(month from d) and (c.pasture_id is null or farm.control_mode='pasture') loop
   select coalesce(sum(quantity),0) into heads from public.herd_stock where farm_id=f and (r.pasture_id is null or pasture_id=r.pasture_id);
   if heads*100 >= r.max_heads*r.warning_percentage then
    exceeded:=heads>r.max_heads; key:='capacity:'||r.id;
    insert into public.alerts(farm_id,pasture_id,type,severity,title,message,dedup_key) values(f,r.pasture_id,case when exceeded then 'capacity_exceeded' else 'capacity_warning' end,case when exceeded then 'critical' else 'warning' end,case when exceeded then 'Capacidade excedida' else 'Próximo da capacidade' end,heads||' / '||r.max_heads||' cabeças',key)
    on conflict(farm_id,dedup_key) do update set type=excluded.type,severity=excluded.severity,message=excluded.message,title=excluded.title,status=case when public.alerts.status='ignored' and public.alerts.type=excluded.type then 'ignored' else 'pending' end,resolved_at=null;
   end if;
  end loop;
 end if;
 update public.alerts a set status='resolved',resolved_at=now() where a.farm_id=f and a.type='financial_pending' and exists(select 1 from public.movements m where m.id=a.movement_id and m.value_cents is not null);
 for r in select * from public.movements where farm_id=f and type in ('Compra','Venda') and value_cents is null loop
  insert into public.alerts(farm_id,movement_id,type,severity,title,message,dedup_key) values(f,r.id,'financial_pending','warning',r.type||' aguardando valor',r.quantity||' '||lower(r.category)||' aguardando valor financeiro.','financial:'||r.id)
  on conflict(farm_id,dedup_key) do update set message=excluded.message,status=case when public.alerts.status='ignored' then 'ignored' else 'pending' end,resolved_at=null;
 end loop;
end $$;
create function public.create_farm(p_id uuid,p_name text,p_mode text,p_opening_date date default current_date) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 if p_opening_date>(now() at time zone 'America/Sao_Paulo')::date or p_opening_date<'1900-01-01' then raise exception 'Data inicial inválida.'; end if;
 if exists(select 1 from public.farms where id=p_id and created_by=auth.uid()) then return p_id; end if;
 insert into public.farms(id,name,control_mode,created_by,opening_date) values(p_id,trim(p_name),p_mode,auth.uid(),p_opening_date);
 insert into public.farm_members(farm_id,user_id) values(p_id,auth.uid());
 return p_id;
end $$;

create function public.farm_command(p_farm_id uuid,p_mutation_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.farms; previous public.mutation_receipts; r jsonb; entity_id uuid; existing public.movements; result jsonb; request jsonb;
 d date := (now() at time zone 'America/Sao_Paulo')::date; p uuid; dest uuid; o uuid; v bigint; last_mode record;
begin
 if auth.uid() is null or not private.is_member(p_farm_id) then raise exception 'Você não tem permissão para alterar esta fazenda.' using errcode='42501'; end if;
 select * into strict f from public.farms where id=p_farm_id for update;
 if f.archived then raise exception 'Esta fazenda está arquivada.'; end if;
 if p_mutation_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000000 then raise exception 'Operação inválida.'; end if;
 request:=jsonb_build_object('action',p_action,'payload',p_payload);
 select * into previous from public.mutation_receipts where farm_id=f.id and user_id=auth.uid() and client_mutation_id=p_mutation_id;
 if found then
  if previous.request<>request then raise exception 'O identificador já foi usado em outra operação.'; end if;
  return previous.result;
 end if;
 entity_id:=coalesce(nullif(p_payload->>'id','')::uuid,p_mutation_id);
 p:=nullif(p_payload->>'pastureId','')::uuid; dest:=nullif(p_payload->>'destinationId','')::uuid; o:=nullif(p_payload->>'ownerId','')::uuid;
 if p_action in ('movement.save','movement.delete') then
  select * into existing from public.movements where farm_id=f.id and id=entity_id;
  if p_action='movement.delete' then
   if existing.id is null then raise exception 'Movimentação não encontrada.'; end if;
   delete from public.movements where id=entity_id;
  else
   if (p_payload->>'date')::date not between f.opening_date and d then raise exception 'Informe uma data válida dentro do período de controle.'; end if;
   select * into last_mode from public.mode_changes where farm_id=f.id order by date desc,sequence desc limit 1;
   if last_mode.id is not null and ((p_payload->>'date')::date<last_mode.date or (existing.id is not null and existing.sequence<last_mode.sequence)) then raise exception 'Preserve o histórico anterior à mudança de modo. Registre um ajuste atual.'; end if;
   if f.control_mode='farm' and (p is not null or dest is not null or p_payload->>'type'='Transferência de pasto') then raise exception 'Esta fazenda usa estoque geral, sem pastos.'; end if;
   if f.control_mode='pasture' and p is null and p_payload->>'type'<>'Transferência de pasto' then raise exception 'Selecione um pasto.'; end if;
   if p is not null and not exists(select 1 from public.pastures where farm_id=f.id and id=p and not archived) then raise exception 'Selecione um pasto ativo desta fazenda.'; end if;
   if dest is not null and not exists(select 1 from public.pastures where farm_id=f.id and id=dest and not archived) then raise exception 'Selecione um destino ativo desta fazenda.'; end if;
   v:=nullif((p_payload->>'valueCents')::bigint,0);
   insert into public.movements(id,farm_id,type,category,quantity,direction,pasture_id,destination_pasture_id,owner_id,date,value_cents,note,source,created_by,client_mutation_id)
   values(entity_id,f.id,p_payload->>'type',p_payload->>'category',(p_payload->>'quantity')::bigint,coalesce((p_payload->>'direction')::smallint,1),p,dest,o,(p_payload->>'date')::date,v,coalesce(p_payload->>'note',''),coalesce(p_payload->>'source','normal'),auth.uid(),p_mutation_id)
   on conflict(id) do update set type=excluded.type,category=excluded.category,quantity=excluded.quantity,direction=excluded.direction,pasture_id=excluded.pasture_id,destination_pasture_id=excluded.destination_pasture_id,owner_id=excluded.owner_id,date=excluded.date,value_cents=excluded.value_cents,note=excluded.note
   where public.movements.farm_id=f.id;
   if not found then raise exception 'Registro de outra fazenda.'; end if;
   delete from public.finances where farm_id=f.id and movement_id=entity_id;
   if v is not null and p_payload->>'type' in ('Compra','Venda') then
    insert into public.finances(farm_id,type,category,value_cents,date,description,source,movement_id,owner_id,created_by,created_at)
    values(f.id,case when p_payload->>'type'='Venda' then 'Entrada' else 'Despesa' end,case when p_payload->>'type'='Venda' then 'Venda de gado' else 'Compra de gado' end,v,(p_payload->>'date')::date,(p_payload->>'type')||': '||(p_payload->>'quantity')||' '||(p_payload->>'category'),case when p_payload->>'type'='Venda' then 'cattle_sale' else 'cattle_purchase' end,entity_id,o,auth.uid(),now());
   end if;
   if p_payload ? 'photo' then perform private.save_photo(f.id,p_payload->'photo',entity_id); end if;
  end if;
  perform private.rebuild_stock(f.id);
 elsif p_action='pasture.save' then
  if f.control_mode<>'pasture' then raise exception 'Ative o controle por pastos.'; end if;
  insert into public.pastures(id,farm_id,name,description,address) values(entity_id,f.id,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'address',''))
  on conflict(id) do update set name=excluded.name,description=excluded.description,address=excluded.address,updated_at=now() where public.pastures.farm_id=f.id;
  if not found then raise exception 'Registro de outra fazenda.'; end if;
 elsif p_action='pasture.archive' then
  if exists(select 1 from public.herd_stock where farm_id=f.id and pasture_id=entity_id and quantity>0) then raise exception 'Transfira os animais antes de arquivar o pasto.'; end if;
  update public.pastures set archived=true,updated_at=now() where id=entity_id and farm_id=f.id;
 elsif p_action='owner.save' then
  insert into public.owners(id,farm_id,name) values(entity_id,f.id,trim(p_payload->>'name')) on conflict(id) do update set name=excluded.name where public.owners.farm_id=f.id;
  if not found then raise exception 'Registro de outra fazenda.'; end if;
 elsif p_action='finance.save' then
  if (p_payload->>'date')::date>d then raise exception 'Data financeira futura.'; end if;
  insert into public.finances(id,farm_id,type,category,value_cents,date,description,source,owner_id,property,notes,created_by,created_at)
  values(entity_id,f.id,p_payload->>'type',p_payload->>'category',(p_payload->>'valueCents')::bigint,(p_payload->>'date')::date,p_payload->>'description','manual',o,coalesce(p_payload->>'property',''),coalesce(p_payload->>'notes',''),auth.uid(),now())
  on conflict(id) do update set type=excluded.type,category=excluded.category,value_cents=excluded.value_cents,date=excluded.date,description=excluded.description,owner_id=excluded.owner_id,property=excluded.property,notes=excluded.notes where public.finances.farm_id=f.id and public.finances.source='manual';
  if not found then raise exception 'Este lançamento deve ser corrigido pela origem.'; end if;
 elsif p_action='finance.delete' then
  delete from public.finances where farm_id=f.id and id=entity_id and source='manual';
  if not found then raise exception 'Lançamento manual não encontrado.'; end if;
 elsif p_action='capacity.save' then
  if p is not null and (f.control_mode<>'pasture' or not exists(select 1 from public.pastures where id=p and farm_id=f.id and not archived)) then raise exception 'Pasto inválido.'; end if;
  insert into public.capacity_rules(farm_id,pasture_id,year,month,max_heads,warning_percentage,active) values(f.id,p,(p_payload->>'year')::integer,(p_payload->>'month')::integer,(p_payload->>'maxHeads')::bigint,(p_payload->>'warningPercentage')::integer,coalesce((p_payload->>'active')::boolean,true))
  on conflict(farm_id,pasture_id,year,month) do update set max_heads=excluded.max_heads,warning_percentage=excluded.warning_percentage,active=excluded.active,updated_at=now();
 elsif p_action='farm.settings' then
  update public.farms set name=coalesce(nullif(trim(p_payload->>'name'),''),name),description=coalesce(p_payload->>'description',description),capacity_enabled=coalesce((p_payload->>'capacityEnabled')::boolean,capacity_enabled) where id=f.id;
 elsif p_action='farm.mode' then
  if p_payload->>'mode' not in ('farm','pasture') then raise exception 'Modo inválido.'; end if;
  if p_payload->>'mode'<>f.control_mode then
   if p_payload->>'mode'='farm' and coalesce((p_payload->>'confirmed')::boolean,false)=false then raise exception 'Confirme a consolidação do estoque.'; end if;
   insert into public.mode_changes(farm_id,mode,date,sequence,created_by) values(f.id,p_payload->>'mode',d,nextval(pg_get_serial_sequence('public.movements','sequence')),auth.uid());
   update public.farms set control_mode=p_payload->>'mode' where id=f.id;
   perform private.rebuild_stock(f.id);
  end if;
 elsif p_action='alert.status' then
  if p_payload->>'status' not in ('ignored','resolved') then raise exception 'Situação inválida.'; end if;
  if p_payload->>'status'='resolved' and exists(select 1 from public.alerts where id=entity_id and farm_id=f.id and type in ('financial_pending','capacity_warning','capacity_exceeded') and status='pending') then raise exception 'Corrija a causa da pendência ou escolha Ignorar.'; end if;
  update public.alerts set status=p_payload->>'status',resolved_at=now() where farm_id=f.id and id=entity_id;
 elsif p_action='photo.save' then perform private.save_photo(f.id,p_payload,null);
 elsif p_action='photo.delete' then delete from public.photos where farm_id=f.id and id=entity_id;
 elsif p_action='import' then perform private.import_farm(f.id,p_payload);
 else raise exception 'Operação não reconhecida.';
 end if;
 perform private.refresh_alerts(f.id);
 update public.farms set revision=revision+1,updated_at=now() where id=f.id;
 result:=jsonb_build_object('id',entity_id,'farmId',f.id,'clientMutationId',p_mutation_id);
 insert into public.mutation_receipts(farm_id,user_id,client_mutation_id,request,result) values(f.id,auth.uid(),p_mutation_id,request,result);
 return result;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin(),private.is_member(uuid),private.can_read(uuid) to authenticated;
revoke all on function public.create_farm(uuid,text,text,date),public.farm_command(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.create_farm(uuid,text,text,date),public.farm_command(uuid,uuid,text,jsonb) to authenticated;
commit;
