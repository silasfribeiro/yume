-- =====================================================================
-- Yume · Controle de estoque e vendas
-- Cole este arquivo inteiro no Supabase > SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem problema (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas de cadastro ----------
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text default '#A6C969',
  criado_em timestamptz default now()
);

create table if not exists colecoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  criado_em timestamptz default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  lugar text,
  data_inicio date,
  data_fim date,
  custo_mesa numeric(10,2) default 0,
  observacoes text,
  status text not null default 'planejado' check (status in ('planejado','aberto','fechado')),
  criado_em timestamptz default now()
);

-- Locais de estoque. Cada evento ganha um local do tipo 'evento'.
create table if not exists locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'outro' check (tipo in ('atelie','box','evento','outro')),
  evento_id uuid references eventos(id) on delete cascade,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sku text,
  categoria_id uuid references categorias(id) on delete set null,
  colecao_id uuid references colecoes(id) on delete set null,
  variacao text,
  preco numeric(10,2) not null default 0,
  custo numeric(10,2) not null default 0,
  estoque_minimo int not null default 0,
  foto_url text,
  ativo boolean default true,
  observacoes text,
  criado_em timestamptz default now()
);

-- ---------- Vendas ----------
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  data timestamptz not null default now(),
  local_id uuid references locais(id) on delete set null,
  canal text not null default 'atelie' check (canal in ('atelie','box','evento','online','outro')),
  evento_id uuid references eventos(id) on delete set null,
  forma_pagamento text default 'pix',
  desconto numeric(10,2) default 0,
  total numeric(10,2) not null default 0,
  origem text default 'manual' check (origem in ('manual','caixa','contagem')),
  observacao text,
  criado_em timestamptz default now()
);

create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  quantidade int not null check (quantidade > 0),
  preco_unit numeric(10,2) not null default 0,
  custo_unit numeric(10,2) not null default 0
);

-- ---------- Movimentações (fonte da verdade do estoque) ----------
-- origem_id: de onde sai | destino_id: para onde vai
create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','transferencia','venda','ajuste','devolucao')),
  quantidade int not null check (quantidade > 0),
  origem_id uuid references locais(id) on delete restrict,
  destino_id uuid references locais(id) on delete restrict,
  venda_id uuid references vendas(id) on delete cascade,
  observacao text,
  criado_em timestamptz default now()
);
create index if not exists mov_prod_idx on movimentacoes(produto_id);
create index if not exists mov_orig_idx on movimentacoes(origem_id);
create index if not exists mov_dest_idx on movimentacoes(destino_id);
create index if not exists vendas_data_idx on vendas(data);
create index if not exists vi_venda_idx on venda_itens(venda_id);

create table if not exists contagens (
  id uuid primary key default gen_random_uuid(),
  local_id uuid references locais(id) on delete cascade,
  venda_id uuid references vendas(id) on delete set null,
  itens_vendidos int default 0,
  total numeric(10,2) default 0,
  observacao text,
  criado_em timestamptz default now()
);

create table if not exists configuracoes (
  chave text primary key,
  valor jsonb
);

-- ---------- Estoque atual (calculado) ----------
create or replace view estoque_atual with (security_invoker = true) as
select produto_id, local_id, sum(q)::int as quantidade
from (
  select produto_id, destino_id as local_id, quantidade as q from movimentacoes where destino_id is not null
  union all
  select produto_id, origem_id as local_id, -quantidade as q from movimentacoes where origem_id is not null
) t
group by produto_id, local_id;

-- ---------- Funções (operações atômicas) ----------

-- Registra uma venda completa: venda + itens + baixa de estoque
-- p = { local_id, canal, evento_id, forma_pagamento, desconto, origem, observacao, data,
--       itens: [{produto_id, quantidade, preco_unit}] }
create or replace function registrar_venda(p jsonb)
returns uuid language plpgsql security invoker as $$
declare
  v_id uuid;
  it jsonb;
  v_total numeric := 0;
  v_custo numeric;
  v_local uuid := nullif(p->>'local_id','')::uuid;
begin
  insert into vendas(data, local_id, canal, evento_id, forma_pagamento, desconto, origem, observacao)
  values (coalesce((p->>'data')::timestamptz, now()), v_local, coalesce(p->>'canal','atelie'),
          nullif(p->>'evento_id','')::uuid, coalesce(p->>'forma_pagamento','pix'),
          coalesce((p->>'desconto')::numeric,0), coalesce(p->>'origem','manual'), p->>'observacao')
  returning id into v_id;

  for it in select * from jsonb_array_elements(p->'itens') loop
    if (it->>'quantidade')::int > 0 then
      select custo into v_custo from produtos where id = (it->>'produto_id')::uuid;
      insert into venda_itens(venda_id, produto_id, quantidade, preco_unit, custo_unit)
      values (v_id, (it->>'produto_id')::uuid, (it->>'quantidade')::int,
              (it->>'preco_unit')::numeric, coalesce(v_custo,0));
      insert into movimentacoes(produto_id, tipo, quantidade, origem_id, venda_id)
      values ((it->>'produto_id')::uuid, 'venda', (it->>'quantidade')::int, v_local, v_id);
      v_total := v_total + (it->>'quantidade')::int * (it->>'preco_unit')::numeric;
    end if;
  end loop;

  update vendas set total = greatest(v_total - coalesce((p->>'desconto')::numeric,0), 0) where id = v_id;
  return v_id;
end $$;

-- Registra várias movimentações de uma vez
-- p = { tipo, origem_id, destino_id, observacao, itens: [{produto_id, quantidade}] }
create or replace function registrar_movimentos(p jsonb)
returns int language plpgsql security invoker as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p->'itens') loop
    if (it->>'quantidade')::int > 0 then
      insert into movimentacoes(produto_id, tipo, quantidade, origem_id, destino_id, observacao)
      values ((it->>'produto_id')::uuid, p->>'tipo', (it->>'quantidade')::int,
              nullif(p->>'origem_id','')::uuid, nullif(p->>'destino_id','')::uuid, p->>'observacao');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Fecha um evento: devolve tudo que sobrou para o destino (estoque principal)
create or replace function fechar_evento(p_evento uuid, p_destino uuid)
returns int language plpgsql security invoker as $$
declare v_local uuid; r record; n int := 0;
begin
  select id into v_local from locais where evento_id = p_evento limit 1;
  for r in select produto_id, quantidade from estoque_atual where local_id = v_local and quantidade > 0 loop
    insert into movimentacoes(produto_id, tipo, quantidade, origem_id, destino_id, observacao)
    values (r.produto_id, 'transferencia', r.quantidade, v_local, p_destino, 'Fechamento do evento');
    n := n + 1;
  end loop;
  update eventos set status = 'fechado' where id = p_evento;
  update locais set ativo = false where id = v_local;
  return n;
end $$;

-- Cria o local automaticamente quando um evento é criado
create or replace function evento_cria_local() returns trigger language plpgsql as $$
begin
  insert into locais(nome, tipo, evento_id) values ('Evento: ' || new.nome, 'evento', new.id);
  return new;
end $$;
drop trigger if exists trg_evento_local on eventos;
create trigger trg_evento_local after insert on eventos for each row execute function evento_cria_local();

create or replace function evento_renomeia_local() returns trigger language plpgsql as $$
begin
  update locais set nome = 'Evento: ' || new.nome where evento_id = new.id;
  return new;
end $$;
drop trigger if exists trg_evento_local_upd on eventos;
create trigger trg_evento_local_upd after update of nome on eventos for each row execute function evento_renomeia_local();

-- ---------- Segurança: só usuários logados acessam ----------
do $$
declare t text;
begin
  foreach t in array array['categorias','colecoes','eventos','locais','produtos','vendas','venda_itens','movimentacoes','contagens','configuracoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "logados" on %I', t);
    execute format('create policy "logados" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Permissões da API (projetos novos do Supabase não liberam isso sozinhos)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.categorias to anon; -- usado só pelo robô que mantém o banco ativo (o RLS não mostra nada)
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

revoke execute on function registrar_venda(jsonb) from anon, public;
revoke execute on function registrar_movimentos(jsonb) from anon, public;
revoke execute on function fechar_evento(uuid, uuid) from anon, public;
grant execute on function registrar_venda(jsonb) to authenticated;
grant execute on function registrar_movimentos(jsonb) to authenticated;
grant execute on function fechar_evento(uuid, uuid) to authenticated;

-- ---------- Fotos dos produtos ----------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

drop policy if exists "fotos leitura" on storage.objects;
create policy "fotos leitura" on storage.objects for select using (bucket_id = 'produtos');
drop policy if exists "fotos envio" on storage.objects;
create policy "fotos envio" on storage.objects for insert to authenticated with check (bucket_id = 'produtos');
drop policy if exists "fotos edicao" on storage.objects;
create policy "fotos edicao" on storage.objects for update to authenticated using (bucket_id = 'produtos');
drop policy if exists "fotos exclusao" on storage.objects;
create policy "fotos exclusao" on storage.objects for delete to authenticated using (bucket_id = 'produtos');

-- ---------- Dados iniciais ----------
insert into categorias (nome, cor) values
  ('Boton', '#A6C969'), ('Print', '#CADBB7'), ('Adesivo', '#FEE398'),
  ('Cartela de adesivos', '#FEE398'), ('Chaveiro', '#A6C969'), ('Ímã', '#CADBB7'),
  ('Marcador de página', '#FEE398'), ('Washi tape', '#A6C969'), ('Caneca', '#CADBB7'),
  ('Porta-copos', '#FEE398'), ('Outro', '#EFF2EE')
on conflict (nome) do nothing;

insert into locais (nome, tipo)
select 'Estoque principal', 'atelie' where not exists (select 1 from locais where tipo = 'atelie');
insert into locais (nome, tipo)
select 'Box Liberdade', 'box' where not exists (select 1 from locais where tipo = 'box');

insert into configuracoes (chave, valor) values
  ('box_aluguel', '0'), ('box_comissao_pct', '0'), ('encalhado_dias', '30')
on conflict (chave) do nothing;
-- =====================================================================
-- Yume · Controle de estoque e vendas
-- Cole este arquivo inteiro no Supabase > SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem problema (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas de cadastro ----------
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text default '#A6C969',
  criado_em timestamptz default now()
);

create table if not exists colecoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  criado_em timestamptz default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  lugar text,
  data_inicio date,
  data_fim date,
  custo_mesa numeric(10,2) default 0,
  observacoes text,
  status text not null default 'planejado' check (status in ('planejado','aberto','fechado')),
  criado_em timestamptz default now()
);

-- Locais de estoque. Cada evento ganha um local do tipo 'evento'.
create table if not exists locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'outro' check (tipo in ('atelie','box','evento','outro')),
  evento_id uuid references eventos(id) on delete cascade,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sku text,
  categoria_id uuid references categorias(id) on delete set null,
  colecao_id uuid references colecoes(id) on delete set null,
  variacao text,
  preco numeric(10,2) not null default 0,
  custo numeric(10,2) not null default 0,
  estoque_minimo int not null default 0,
  foto_url text,
  ativo boolean default true,
  observacoes text,
  criado_em timestamptz default now()
);

-- ---------- Vendas ----------
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  data timestamptz not null default now(),
  local_id uuid references locais(id) on delete set null,
  canal text not null default 'atelie' check (canal in ('atelie','box','evento','online','outro')),
  evento_id uuid references eventos(id) on delete set null,
  forma_pagamento text default 'pix',
  desconto numeric(10,2) default 0,
  total numeric(10,2) not null default 0,
  origem text default 'manual' check (origem in ('manual','caixa','contagem')),
  observacao text,
  criado_em timestamptz default now()
);

create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  quantidade int not null check (quantidade > 0),
  preco_unit numeric(10,2) not null default 0,
  custo_unit numeric(10,2) not null default 0
);

-- ---------- Movimentações (fonte da verdade do estoque) ----------
-- origem_id: de onde sai | destino_id: para onde vai
create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','transferencia','venda','ajuste','devolucao')),
  quantidade int not null check (quantidade > 0),
  origem_id uuid references locais(id) on delete restrict,
  destino_id uuid references locais(id) on delete restrict,
  venda_id uuid references vendas(id) on delete cascade,
  observacao text,
  criado_em timestamptz default now()
);
create index if not exists mov_prod_idx on movimentacoes(produto_id);
create index if not exists mov_orig_idx on movimentacoes(origem_id);
create index if not exists mov_dest_idx on movimentacoes(destino_id);
create index if not exists vendas_data_idx on vendas(data);
create index if not exists vi_venda_idx on venda_itens(venda_id);

create table if not exists contagens (
  id uuid primary key default gen_random_uuid(),
  local_id uuid references locais(id) on delete cascade,
  venda_id uuid references vendas(id) on delete set null,
  itens_vendidos int default 0,
  total numeric(10,2) default 0,
  observacao text,
  criado_em timestamptz default now()
);

create table if not exists configuracoes (
  chave text primary key,
  valor jsonb
);

-- ---------- Estoque atual (calculado) ----------
create or replace view estoque_atual with (security_invoker = true) as
select produto_id, local_id, sum(q)::int as quantidade
from (
  select produto_id, destino_id as local_id, quantidade as q from movimentacoes where destino_id is not null
  union all
  select produto_id, origem_id as local_id, -quantidade as q from movimentacoes where origem_id is not null
) t
group by produto_id, local_id;

-- ---------- Funções (operações atômicas) ----------

-- Registra uma venda completa: venda + itens + baixa de estoque
-- p = { local_id, canal, evento_id, forma_pagamento, desconto, origem, observacao, data,
--       itens: [{produto_id, quantidade, preco_unit}] }
create or replace function registrar_venda(p jsonb)
returns uuid language plpgsql security invoker as $$
declare
  v_id uuid;
  it jsonb;
  v_total numeric := 0;
  v_custo numeric;
  v_local uuid := nullif(p->>'local_id','')::uuid;
begin
  insert into vendas(data, local_id, canal, evento_id, forma_pagamento, desconto, origem, observacao)
  values (coalesce((p->>'data')::timestamptz, now()), v_local, coalesce(p->>'canal','atelie'),
          nullif(p->>'evento_id','')::uuid, coalesce(p->>'forma_pagamento','pix'),
          coalesce((p->>'desconto')::numeric,0), coalesce(p->>'origem','manual'), p->>'observacao')
  returning id into v_id;

  for it in select * from jsonb_array_elements(p->'itens') loop
    if (it->>'quantidade')::int > 0 then
      select custo into v_custo from produtos where id = (it->>'produto_id')::uuid;
      insert into venda_itens(venda_id, produto_id, quantidade, preco_unit, custo_unit)
      values (v_id, (it->>'produto_id')::uuid, (it->>'quantidade')::int,
              (it->>'preco_unit')::numeric, coalesce(v_custo,0));
      insert into movimentacoes(produto_id, tipo, quantidade, origem_id, venda_id)
      values ((it->>'produto_id')::uuid, 'venda', (it->>'quantidade')::int, v_local, v_id);
      v_total := v_total + (it->>'quantidade')::int * (it->>'preco_unit')::numeric;
    end if;
  end loop;

  update vendas set total = greatest(v_total - coalesce((p->>'desconto')::numeric,0), 0) where id = v_id;
  return v_id;
end $$;

-- Registra várias movimentações de uma vez
-- p = { tipo, origem_id, destino_id, observacao, itens: [{produto_id, quantidade}] }
create or replace function registrar_movimentos(p jsonb)
returns int language plpgsql security invoker as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p->'itens') loop
    if (it->>'quantidade')::int > 0 then
      insert into movimentacoes(produto_id, tipo, quantidade, origem_id, destino_id, observacao)
      values ((it->>'produto_id')::uuid, p->>'tipo', (it->>'quantidade')::int,
              nullif(p->>'origem_id','')::uuid, nullif(p->>'destino_id','')::uuid, p->>'observacao');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Fecha um evento: devolve tudo que sobrou para o destino (estoque principal)
create or replace function fechar_evento(p_evento uuid, p_destino uuid)
returns int language plpgsql security invoker as $$
declare v_local uuid; r record; n int := 0;
begin
  select id into v_local from locais where evento_id = p_evento limit 1;
  for r in select produto_id, quantidade from estoque_atual where local_id = v_local and quantidade > 0 loop
    insert into movimentacoes(produto_id, tipo, quantidade, origem_id, destino_id, observacao)
    values (r.produto_id, 'transferencia', r.quantidade, v_local, p_destino, 'Fechamento do evento');
    n := n + 1;
  end loop;
  update eventos set status = 'fechado' where id = p_evento;
  update locais set ativo = false where id = v_local;
  return n;
end $$;

-- Cria o local automaticamente quando um evento é criado
create or replace function evento_cria_local() returns trigger language plpgsql as $$
begin
  insert into locais(nome, tipo, evento_id) values ('Evento: ' || new.nome, 'evento', new.id);
  return new;
end $$;
drop trigger if exists trg_evento_local on eventos;
create trigger trg_evento_local after insert on eventos for each row execute function evento_cria_local();

create or replace function evento_renomeia_local() returns trigger language plpgsql as $$
begin
  update locais set nome = 'Evento: ' || new.nome where evento_id = new.id;
  return new;
end $$;
drop trigger if exists trg_evento_local_upd on eventos;
create trigger trg_evento_local_upd after update of nome on eventos for each row execute function evento_renomeia_local();

-- ---------- Segurança: só usuários logados acessam ----------
do $$
declare t text;
begin
  foreach t in array array['categorias','colecoes','eventos','locais','produtos','vendas','venda_itens','movimentacoes','contagens','configuracoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "logados" on %I', t);
    execute format('create policy "logados" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

revoke execute on function registrar_venda(jsonb) from anon, public;
revoke execute on function registrar_movimentos(jsonb) from anon, public;
revoke execute on function fechar_evento(uuid, uuid) from anon, public;
grant execute on function registrar_venda(jsonb) to authenticated;
grant execute on function registrar_movimentos(jsonb) to authenticated;
grant execute on function fechar_evento(uuid, uuid) to authenticated;

-- ---------- Fotos dos produtos ----------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

drop policy if exists "fotos leitura" on storage.objects;
create policy "fotos leitura" on storage.objects for select using (bucket_id = 'produtos');
drop policy if exists "fotos envio" on storage.objects;
create policy "fotos envio" on storage.objects for insert to authenticated with check (bucket_id = 'produtos');
drop policy if exists "fotos edicao" on storage.objects;
create policy "fotos edicao" on storage.objects for update to authenticated using (bucket_id = 'produtos');
drop policy if exists "fotos exclusao" on storage.objects;
create policy "fotos exclusao" on storage.objects for delete to authenticated using (bucket_id = 'produtos');

-- ---------- Dados iniciais ----------
insert into categorias (nome, cor) values
  ('Boton', '#A6C969'), ('Print', '#CADBB7'), ('Adesivo', '#FEE398'),
  ('Cartela de adesivos', '#FEE398'), ('Chaveiro', '#A6C969'), ('Ímã', '#CADBB7'),
  ('Marcador de página', '#FEE398'), ('Washi tape', '#A6C969'), ('Caneca', '#CADBB7'),
  ('Porta-copos', '#FEE398'), ('Outro', '#EFF2EE')
on conflict (nome) do nothing;

insert into locais (nome, tipo)
select 'Estoque principal', 'atelie' where not exists (select 1 from locais where tipo = 'atelie');
insert into locais (nome, tipo)
select 'Box Liberdade', 'box' where not exists (select 1 from locais where tipo = 'box');

insert into configuracoes (chave, valor) values
  ('box_aluguel', '0'), ('box_comissao_pct', '0'), ('encalhado_dias', '30')
on conflict (chave) do nothing;
