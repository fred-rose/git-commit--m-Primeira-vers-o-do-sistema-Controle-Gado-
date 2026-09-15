begin;
-- Uma consulta deve enxergar estoque, histórico e financeiro no mesmo instante,
-- mesmo quando outro dispositivo confirma uma transação durante a leitura.
alter function public.farm_snapshot(uuid[]) stable;
alter function public.admin_overview() stable;

-- Completar o valor não reescreve uma movimentação anterior à troca de modo.
-- A mesma trava por fazenda serializa esta operação com farm_command.
create function public.complete_movement_value(
 p_farm_id uuid, p_mutation_id uuid, p_movement_id uuid, p_value_cents bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 f public.farms; m public.movements; previous public.mutation_receipts;
 request jsonb; result jsonb;
begin
 if auth.uid() is null or not private.is_member(p_farm_id) then
  raise exception 'Você não tem permissão para alterar esta fazenda.' using errcode='42501';
 end if;
 select * into strict f from public.farms where id=p_farm_id for update;
 if f.archived then raise exception 'Esta fazenda está arquivada.'; end if;
 if p_mutation_id is null or p_movement_id is null or p_value_cents is null
    or p_value_cents not between 1 and 9007199254740991 then
  raise exception 'Informe um valor maior que zero, dentro do limite permitido.';
 end if;
 request:=jsonb_build_object('action','movement.value','payload',jsonb_build_object('id',p_movement_id,'valueCents',p_value_cents));
 select * into previous from public.mutation_receipts
  where farm_id=f.id and user_id=auth.uid() and client_mutation_id=p_mutation_id;
 if found then
  if previous.request<>request then raise exception 'O identificador já foi usado em outra operação.'; end if;
  return previous.result;
 end if;
 select * into m from public.movements where farm_id=f.id and id=p_movement_id;
 if not found or m.type not in ('Compra','Venda') then
  raise exception 'Compra ou venda não encontrada nesta fazenda.';
 end if;
 if m.value_cents is not null and m.value_cents<>p_value_cents then
  raise exception 'Esta movimentação já recebeu um valor. Confira o lançamento antes de corrigir.';
 end if;
 update public.movements set value_cents=p_value_cents where id=m.id;
 insert into public.finances(farm_id,type,category,value_cents,date,description,source,movement_id,owner_id,notes,created_by,created_at)
 values(f.id,case when m.type='Venda' then 'Entrada' else 'Despesa' end,
  case when m.type='Venda' then 'Venda de gado' else 'Compra de gado' end,
  p_value_cents,m.date,m.type||': '||m.quantity||' '||m.category,
  case when m.type='Venda' then 'cattle_sale' else 'cattle_purchase' end,
  m.id,m.owner_id,m.note,auth.uid(),now())
 on conflict(farm_id,movement_id) do update set value_cents=excluded.value_cents;
 perform private.refresh_alerts(f.id);
 update public.farms set revision=revision+1,updated_at=now() where id=f.id;
 result:=jsonb_build_object('id',m.id,'farmId',f.id,'clientMutationId',p_mutation_id);
 insert into public.mutation_receipts(farm_id,user_id,client_mutation_id,request,result)
 values(f.id,auth.uid(),p_mutation_id,request,result);
 return result;
end $$;
revoke all on function public.complete_movement_value(uuid,uuid,uuid,bigint) from public,anon;
grant execute on function public.complete_movement_value(uuid,uuid,uuid,bigint) to authenticated;
commit;
