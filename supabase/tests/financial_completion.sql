begin;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000010','owner@test.invalid'),
 ('10000000-0000-0000-0000-000000000011','foreign@test.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000010',true);
select public.create_farm('20000000-0000-0000-0000-000000000010','Pendente antes da consolidação','pasture','2026-01-01');
select public.farm_command('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'pasture.save','{"id":"40000000-0000-0000-0000-000000000010","name":"Serra"}');
select public.farm_command('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'movement.save','{"type":"Compra","category":"Vacas","quantity":10,"date":"2026-01-01","pastureId":"40000000-0000-0000-0000-000000000010","id":"30000000-0000-0000-0000-000000000010"}');
select public.farm_command('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'movement.save','{"type":"Venda","category":"Vacas","quantity":8,"date":"2026-01-02","pastureId":"40000000-0000-0000-0000-000000000010","id":"30000000-0000-0000-0000-000000000011"}');
select public.farm_command('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'farm.mode','{"mode":"farm","confirmed":true}');
select public.complete_movement_value('20000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000010',50000);
select public.complete_movement_value('20000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000011',80000);
-- Resposta perdida e reenvio: um único financeiro e nenhuma alteração do estoque.
select public.complete_movement_value('20000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000011',80000);
do $$begin
 if(select sum(quantity)from public.herd_stock)<>2 or exists(select 1 from public.herd_stock where pasture_id is not null) then raise exception 'FAIL estoque após completar valor';end if;
 if(select count(*)from public.finances)<>2 or(select sum(value_cents)from public.finances where type='Entrada')<>80000 or(select sum(value_cents)from public.finances where type='Despesa')<>50000 then raise exception 'FAIL financeiro sem duplicação';end if;
 if exists(select 1 from public.alerts where type='financial_pending' and status='pending') then raise exception 'FAIL pendência resolvida';end if;
 if not exists(select 1 from public.movements where id='30000000-0000-0000-0000-000000000011' and date='2026-01-02' and pasture_id='40000000-0000-0000-0000-000000000010' and quantity=8) then raise exception 'FAIL preservação do histórico';end if;
 begin perform public.complete_movement_value('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'30000000-0000-0000-0000-000000000011',1);raise exception 'FAIL sobrescreveu valor de outro dispositivo';exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.complete_movement_value('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'30000000-0000-0000-0000-000000000011',0);raise exception 'FAIL valor zero';exception when sqlstate 'P0001' then if SQLERRM like 'FAIL%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000011',true);
do $$begin
 begin perform public.complete_movement_value('20000000-0000-0000-0000-000000000010',gen_random_uuid(),'30000000-0000-0000-0000-000000000011',80000);raise exception 'FAIL escrita alheia';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: completar compra/venda após troca de modo, histórico preservado, idempotência, conflito financeiro e isolamento';
