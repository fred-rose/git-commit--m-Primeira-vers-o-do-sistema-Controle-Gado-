begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '' check(length(name)<=100), email text not null default '', avatar_url text,
 system_role text not null default 'user' check(system_role in ('user','super_admin')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,email,avatar_url) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),100),coalesce(new.email,''),new.raw_user_meta_data->>'avatar_url');
 return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function private.new_profile();
insert into public.profiles(id,name,email) select id,left(coalesce(raw_user_meta_data->>'full_name',''),100),coalesce(email,'') from auth.users on conflict do nothing;

create table public.farms (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 description text not null default '' check(length(description)<=2000), control_mode text not null check(control_mode in ('farm','pasture')),
 capacity_enabled boolean not null default false, capacity_method text not null default 'heads' check(capacity_method='heads'),
 opening_date date not null default current_date, created_by uuid not null references public.profiles(id),
 archived boolean not null default false, revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.farm_members (
 farm_id uuid not null references public.farms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'owner' check(role='owner'), created_at timestamptz not null default now(), primary key(farm_id,user_id)
);
create index farm_members_user on public.farm_members(user_id,farm_id);
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and system_role='super_admin')
$$;
create function private.is_member(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.farm_members where farm_id=f and user_id=auth.uid())
$$;
create function private.can_read(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(f) or private.is_admin()
$$;

create table public.owners (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 name text not null check(length(trim(name)) between 1 and 100), unique(farm_id,id)
);
create table public.pastures (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 name text not null check(length(trim(name)) between 1 and 100), description text not null default '' check(length(description)<=2000),
 address text not null default '' check(length(address)<=500), archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(farm_id,id)
);
create unique index pastures_active_name on public.pastures(farm_id,lower(name)) where not archived;
create table public.opening_stock (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 pasture_id uuid, owner_id uuid, category text not null check(category in ('Vacas','Bois','Novilhas','Bezerras','Bezerros')),
 quantity bigint not null check(quantity between 1 and 2147483647),
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), foreign key(farm_id,owner_id) references public.owners(farm_id,id)
);
create table public.herd_stock (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id), pasture_id uuid, owner_id uuid,
 category text not null check(category in ('Vacas','Bois','Novilhas','Bezerras','Bezerros')),
 quantity bigint not null check(quantity between 0 and 2147483647), updated_at timestamptz not null default now(),
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), foreign key(farm_id,owner_id) references public.owners(farm_id,id),
 unique nulls not distinct(farm_id,pasture_id,owner_id,category)
);
create table public.movements (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 type text not null check(type in ('Compra','Venda','Nascimento','Morte','Entrada','Saída','Transferência de pasto','Ajuste de contagem')),
 category text not null check(category in ('Vacas','Bois','Novilhas','Bezerras','Bezerros')), quantity bigint not null check(quantity between 1 and 2147483647),
 direction smallint not null default 1 check(direction in (-1,1)), pasture_id uuid, destination_pasture_id uuid, owner_id uuid,
 date date not null, value_cents bigint check(value_cents between 1 and 9007199254740991), note text not null default '' check(length(note)<=2000),
 source text not null default 'normal' check(source in ('normal','quick_adjustment','offline_quick_adjustment','migration')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 sequence bigint generated by default as identity, client_mutation_id uuid not null,
 unique(farm_id,id), unique(farm_id,client_mutation_id), unique(farm_id,sequence),
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), foreign key(farm_id,destination_pasture_id) references public.pastures(farm_id,id),
 foreign key(farm_id,owner_id) references public.owners(farm_id,id),
 check(type='Transferência de pasto' or destination_pasture_id is null),
 check(type<>'Transferência de pasto' or (destination_pasture_id is not null and destination_pasture_id is distinct from pasture_id)),
 check(type in ('Compra','Venda') or value_cents is null), check(type<>'Nascimento' or category in ('Bezerras','Bezerros'))
);
create index movements_farm_date on public.movements(farm_id,date,sequence);
create table public.mode_changes (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 mode text not null check(mode in ('farm','pasture')), date date not null, created_at timestamptz not null default now(),
 sequence bigint not null, created_by uuid not null references public.profiles(id)
);
create index mode_changes_farm_date on public.mode_changes(farm_id,date,sequence);
create table public.finances (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id),
 type text not null check(type in ('Entrada','Despesa')), category text not null check(length(category)<=100),
 value_cents bigint not null check(value_cents between 1 and 9007199254740991), date date,
 description text not null check(length(trim(description)) between 1 and 500), source text not null check(source in ('manual','migration','cattle_sale','cattle_purchase')),
 movement_id uuid, owner_id uuid, owner text not null default '', property text not null default '', notes text not null default '' check(length(notes)<=2000), provenance jsonb,
 created_by uuid not null references public.profiles(id), created_at timestamptz,
 foreign key(farm_id,movement_id) references public.movements(farm_id,id) on delete cascade,
 foreign key(farm_id,owner_id) references public.owners(farm_id,id), unique(farm_id,movement_id),
 check((movement_id is not null) = (source in ('cattle_sale','cattle_purchase'))), check(date is not null or source='migration')
);
create index finances_farm_date on public.finances(farm_id,date);
create table public.capacity_rules (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id), pasture_id uuid,
 year integer not null check(year between 1900 and 2200), month integer not null check(month between 1 and 12),
 max_heads bigint not null check(max_heads between 1 and 2147483647), warning_percentage integer not null default 90 check(warning_percentage between 1 and 100),
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), unique nulls not distinct(farm_id,pasture_id,year,month)
);
create table public.alerts (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id), pasture_id uuid, movement_id uuid,
 type text not null check(type in ('capacity_warning','capacity_exceeded','financial_pending','offline_pending','sync_error','data_pending')),
 severity text not null check(severity in ('info','warning','critical')), title text not null, message text not null,
 status text not null default 'pending' check(status in ('pending','resolved','ignored')), dedup_key text not null,
 created_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), foreign key(farm_id,movement_id) references public.movements(farm_id,id) on delete cascade,
 unique(farm_id,dedup_key)
);
create index alerts_farm_status on public.alerts(farm_id,status);
create table public.photos (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id), pasture_id uuid, owner_id uuid, movement_id uuid,
 title text not null check(length(trim(title)) between 1 and 100), description text not null default '' check(length(description)<=2000), date date not null,
 storage_path text not null unique, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(farm_id,pasture_id) references public.pastures(farm_id,id), foreign key(farm_id,owner_id) references public.owners(farm_id,id),
 foreign key(farm_id,movement_id) references public.movements(farm_id,id) on delete set null (movement_id),
 check(split_part(storage_path,'/',1)=farm_id::text)
);
create index photos_farm_date on public.photos(farm_id,date);
create table public.mutation_receipts (
 farm_id uuid not null references public.farms(id), user_id uuid not null references public.profiles(id), client_mutation_id uuid not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(farm_id,user_id,client_mutation_id)
);
create table public.imports (
 farm_id uuid not null references public.farms(id), fingerprint text not null, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), primary key(farm_id,fingerprint)
);

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(name,avatar_url) on public.profiles to authenticated;
alter table public.farms enable row level security;
create policy farms_read on public.farms for select to authenticated using(private.can_read(id));
alter table public.farm_members enable row level security;
create policy members_read on public.farm_members for select to authenticated using(user_id=auth.uid() or private.is_admin());
do $$ declare t text; begin
 foreach t in array array['owners','pastures','opening_stock','herd_stock','movements','mode_changes','finances','capacity_rules','alerts','photos','mutation_receipts','imports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy scoped_read on public.%I for select to authenticated using(private.can_read(farm_id))',t);
  execute format('create index %I on public.%I(farm_id)',t||'_farm',t);
 end loop;
 foreach t in array array['farms','farm_members','owners','pastures','opening_stock','herd_stock','movements','mode_changes','finances','capacity_rules','alerts','photos','mutation_receipts','imports'] loop
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
-- O cliente só grava por RPC transacional. Nem o administrador grava fazendas alheias.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin(),private.is_member(uuid),private.can_read(uuid) to authenticated;
commit;
