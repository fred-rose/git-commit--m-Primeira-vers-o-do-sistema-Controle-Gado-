-- Diagnóstico manual em banco com capacidades cadastradas; desfaz todas as alterações.
begin;
do $test$
declare c public.capacity_rules; member_id uuid; target_id uuid; payload jsonb; saved jsonb; before_count bigint;
begin
 select r.* into c from public.capacity_rules r join public.farms f on f.id=r.farm_id
 where not f.archived and (r.pasture_id is null or (f.control_mode='pasture' and exists(select 1 from public.pastures p where p.id=r.pasture_id and not p.archived)))
 order by r.created_at limit 1;
 if not found then raise exception 'Sem capacidade elegível para verificar edição.'; end if;
 select user_id into member_id from public.farm_members where farm_id=c.farm_id limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 target_id:=coalesce(c.period_id,c.id);
 payload:=jsonb_build_object('id',target_id,'year',coalesce(c.period_start_year,c.year),'month',coalesce(c.period_start_month,c.month),'months',coalesce(c.period_months,1),'pastureId',c.pasture_id,'maxHeads',case when c.max_heads=100 then 101 else 100 end,'warningPercentage',c.warning_percentage,'active',c.active);
 select count(*) into before_count from public.capacity_rules where farm_id=c.farm_id;
 saved:=public.farm_command(c.farm_id,gen_random_uuid(),'capacity.save',payload);
 if saved->>'id'<>target_id::text or (select count(*) from public.capacity_rules where farm_id=c.farm_id)<>before_count then raise exception 'Falha ao preservar identidade/quantidade.'; end if;
 if not exists(select 1 from public.capacity_rules where farm_id=c.farm_id and period_id=target_id and max_heads=(payload->>'maxHeads')::bigint) then raise exception 'Falha ao salvar edição.'; end if;
end $test$;
rollback;
select 'PASS: salvamento de capacidade no banco verificado; todas as alterações do teste desfeitas' as result;
