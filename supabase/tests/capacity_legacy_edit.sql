begin;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000088','capacity-edit@test.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000088',true);
select public.create_farm('20000000-0000-0000-0000-000000000088','Teste capacidade','farm','2026-01-01');
reset role;
insert into public.capacity_rules(id,farm_id,year,month,max_heads,warning_percentage)
values ('60000000-0000-0000-0000-000000000088','20000000-0000-0000-0000-000000000088',2026,11,100,90),
('60000000-0000-0000-0000-000000000089','20000000-0000-0000-0000-000000000088',2027,2,200,90);
set local role authenticated;
select public.farm_command('20000000-0000-0000-0000-000000000088',gen_random_uuid(),'capacity.save',
'{"id":"60000000-0000-0000-0000-000000000088","year":2026,"month":11,"months":3,"maxHeads":125,"warningPercentage":85,"active":false}');
do $$ begin
 if (select count(*) from public.capacity_rules where period_id='60000000-0000-0000-0000-000000000088' and period_months=3 and max_heads=125 and not active)<>3 then raise exception 'FAIL edição legado'; end if;
 if not exists(select 1 from public.capacity_rules where period_id='60000000-0000-0000-0000-000000000088' and year=2027 and month=1) then raise exception 'FAIL virada ano'; end if;
 begin
  perform public.farm_command('20000000-0000-0000-0000-000000000088',gen_random_uuid(),'capacity.save',
  '{"id":"60000000-0000-0000-0000-000000000088","year":2026,"month":11,"months":4,"maxHeads":125,"warningPercentage":85}');
  raise exception 'FAIL aceitou conflito legado';
 exception when sqlstate 'P0001' then
  if SQLERRM not like 'Já existe uma capacidade%' then raise; end if;
 end;
 if (select count(*) from public.capacity_rules where period_id='60000000-0000-0000-0000-000000000088')<>3 then raise exception 'FAIL atomicidade'; end if;
end $$;
select public.farm_command('20000000-0000-0000-0000-000000000088',gen_random_uuid(),'capacity.save',
'{"id":"60000000-0000-0000-0000-000000000088","year":2026,"month":11,"months":1,"maxHeads":150,"warningPercentage":80}');
do $$ begin
 if (select count(*) from public.capacity_rules where period_id='60000000-0000-0000-0000-000000000088' and period_months=1 and max_heads=150)<>1 then raise exception 'FAIL redução período'; end if;
 if not exists(select 1 from public.capacity_rules where id='60000000-0000-0000-0000-000000000089' and max_heads=200) then raise exception 'FAIL alterou vizinho'; end if;
end $$;
rollback;
select 'PASS: edição de capacidade antiga, duração, virada de ano, redução e conflito sem perda de dados';
