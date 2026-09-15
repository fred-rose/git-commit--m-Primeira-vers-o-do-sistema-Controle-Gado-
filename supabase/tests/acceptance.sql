begin;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000001','joao@test.invalid'),('10000000-0000-0000-0000-000000000002','carlos@test.invalid'),('10000000-0000-0000-0000-000000000003','admin@test.invalid');
update public.profiles set system_role='super_admin' where id='10000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.create_farm('20000000-0000-0000-0000-000000000001','Fazenda A','pasture','2026-01-01');
select public.create_farm('20000000-0000-0000-0000-000000000002','Fazenda B','farm','2026-01-01');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','pasture.save','{"id":"40000000-0000-0000-0000-000000000001","name":"Barragem"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','pasture.save','{"id":"40000000-0000-0000-0000-000000000002","name":"Serra"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','movement.save','{"type":"Entrada","category":"Vacas","quantity":79,"date":"2026-01-01","pastureId":"40000000-0000-0000-0000-000000000001"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','farm.settings','{"capacityEnabled":true}');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','capacity.save',jsonb_build_object('year',extract(year from current_date),'month',extract(month from current_date),'maxHeads',80,'warningPercentage',90,'pastureId','40000000-0000-0000-0000-000000000001'));
-- Compatibilidade: sem "months" continua criando exatamente 1 mês. Períodos maiores atravessam meses sem alterar o modelo mensal.
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','capacity.save','{"year":2198,"month":1,"months":1,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','capacity.save','{"year":2198,"month":3,"months":2,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000003','capacity.save','{"year":2198,"month":6,"months":3,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000004','capacity.save','{"year":2199,"month":1,"months":12,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000005','capacity.save','{"id":"31000000-0000-0000-0000-000000000001","year":2198,"month":1,"months":1,"maxHeads":125,"warningPercentage":85,"active":false,"pastureId":"40000000-0000-0000-0000-000000000002"}');
do $$ begin
 if(select count(*) from public.capacity_rules where farm_id='20000000-0000-0000-0000-000000000001' and pasture_id='40000000-0000-0000-0000-000000000002')<>18 then raise exception 'FAIL períodos de capacidade';end if;
 if not exists(select 1 from public.capacity_rules where farm_id='20000000-0000-0000-0000-000000000001' and pasture_id='40000000-0000-0000-0000-000000000002' and period_id='31000000-0000-0000-0000-000000000001' and period_months=1 and year=2198 and month=1 and max_heads=125 and warning_percentage=85 and not active) then raise exception 'FAIL edição de capacidade';end if;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'capacity.save','{"year":2198,"month":1,"months":0,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');raise exception 'FAIL aceitou zero';exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'capacity.save','{"year":2198,"month":1,"months":-1,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');raise exception 'FAIL aceitou negativo';exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'capacity.save','{"year":2198,"month":1,"months":1.5,"maxHeads":80,"warningPercentage":90,"pastureId":"40000000-0000-0000-0000-000000000002"}');raise exception 'FAIL aceitou decimal';exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
end $$;
select public.farm_command('20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000006','capacity.delete','{"id":"31000000-0000-0000-0000-000000000004"}');
do $$ begin if exists(select 1 from public.capacity_rules where farm_id='20000000-0000-0000-0000-000000000001' and period_id='31000000-0000-0000-0000-000000000004') then raise exception 'FAIL exclusão de capacidade';end if;end $$;
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','movement.save',jsonb_build_object('type','Entrada','category','Vacas','quantity',3,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001','source','offline_quick_adjustment'));
-- Reenvio idêntico: exatamente 82, nunca 85.
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','movement.save',jsonb_build_object('type','Entrada','category','Vacas','quantity',3,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001','source','offline_quick_adjustment'));
do $$ begin
 if(select sum(quantity) from public.herd_stock where farm_id='20000000-0000-0000-0000-000000000001')<>82 then raise exception 'FAIL idempotência';end if;
 if not exists(select 1 from public.alerts where type='capacity_exceeded' and severity='critical' and status='pending') then raise exception 'FAIL capacidade excedida';end if;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'movement.save',jsonb_build_object('type','Venda','category','Vacas','quantity',100,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001','valueCents',500));raise exception 'FAIL aceitou saldo negativo'; exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
 if(select sum(quantity) from public.herd_stock where farm_id='20000000-0000-0000-0000-000000000001')<>82 or exists(select 1 from public.finances) then raise exception 'FAIL atomicidade';end if;
 begin update public.profiles set system_role='super_admin' where id=auth.uid();raise exception 'FAIL autoelevação';exception when insufficient_privilege then null;end;
 begin insert into public.herd_stock(farm_id,category,quantity)values('20000000-0000-0000-0000-000000000001','Vacas',5);raise exception 'FAIL escrita direta';exception when insufficient_privilege then null;end;
end $$;
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000007','movement.save',jsonb_build_object('type','Venda','category','Vacas','quantity',8,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001'));
do $$ begin if not exists(select 1 from public.alerts where type='financial_pending') then raise exception 'FAIL venda pendente';end if; end $$;
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000008','movement.save',jsonb_build_object('id','30000000-0000-0000-0000-000000000007','type','Venda','category','Vacas','quantity',8,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001','valueCents',80000));
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','movement.save',jsonb_build_object('type','Transferência de pasto','category','Vacas','quantity',20,'date',current_date,'pastureId','40000000-0000-0000-0000-000000000001','destinationId','40000000-0000-0000-0000-000000000002'));
do $$ begin if(select count(*) from public.finances)<>1 or(select sum(quantity) from public.herd_stock where farm_id='20000000-0000-0000-0000-000000000001')<>74 then raise exception 'FAIL financeiro/transferência';end if;end $$;
select public.farm_command('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','movement.save','{"type":"Entrada","category":"Vacas","quantity":200,"date":"2026-01-01"}');
select public.farm_command('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000011','farm.mode','{"mode":"farm","confirmed":true}');
do $$ begin if exists(select 1 from public.herd_stock where farm_id='20000000-0000-0000-0000-000000000001' and pasture_id is not null)then raise exception 'FAIL consolidação';end if;if(select count(*) from public.pastures)<>2 then raise exception 'FAIL preservação pastos';end if;end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select public.create_farm('20000000-0000-0000-0000-000000000003','Fazenda C','farm','2026-01-01');
do $$ begin
 if(select count(*) from public.farms)<>1 or exists(select 1 from public.movements) or exists(select 1 from public.herd_stock)then raise exception 'FAIL isolamento de dados';end if;
 begin perform public.farm_snapshot(array['20000000-0000-0000-0000-000000000001'::uuid]);raise exception 'FAIL snapshot alheio';exception when insufficient_privilege then null;end;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'pasture.save','{"name":"Invadido"}');raise exception 'FAIL escrita alheia';exception when insufficient_privilege then null;end;
 begin perform public.admin_overview();raise exception 'FAIL admin comum';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name)values('farm-photos','20000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/foto.jpg');raise exception 'FAIL storage alheio';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$ begin
 if(select count(*) from public.farms)<>3 then raise exception 'FAIL admin leitura';end if;
 if(public.admin_overview()->'totals'->>'heads')::int<>274 then raise exception 'FAIL total admin';end if;
 begin perform public.farm_command('20000000-0000-0000-0000-000000000001',gen_random_uuid(),'farm.settings','{"name":"Invadido"}');raise exception 'FAIL admin escrita';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: RLS, autoelevação, isolamento Storage, modos, capacidade, estoque, financeiro, idempotência, atomicidade e administrador somente consulta' as result;
