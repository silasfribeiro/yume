-- =====================================================================
-- Yume · Notificações (Telegram + OneSignal)
-- Rode no Supabase > SQL Editor. Pode rodar de novo sem problema.
-- As chaves secretas ficam no Vault do Supabase (nunca no site):
--   select vault.create_secret('TOKEN_DO_BOT', 'telegram_token');
--   select vault.create_secret('REST_API_KEY_DO_ONESIGNAL', 'onesignal_key');
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Preferências (todas ligadas por padrão)
insert into configuracoes (chave, valor) values
  ('notif_venda', 'true'), ('notif_estoque', 'true'), ('notif_contagem', 'true'),
  ('notif_evento', 'true'), ('notif_resumo', 'true')
on conflict (chave) do nothing;

-- Escapa texto para o HTML do Telegram
create or replace function h(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create or replace function brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(v, 0), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.')
$$;

-- Envia para o Telegram e para o OneSignal (o que estiver configurado)
create or replace function notificar(p_titulo text, p_msg text, p_tipo text default 'geral')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_on boolean; v_tg text; v_chat text; v_key text; v_app text; v_txt text;
begin
  select (valor #>> '{}')::boolean into v_on from configuracoes where chave = 'notif_' || p_tipo;
  if v_on is false then return; end if;

  -- Telegram
  select decrypted_secret into v_tg from vault.decrypted_secrets where name = 'telegram_token' limit 1;
  select valor #>> '{}' into v_chat from configuracoes where chave = 'telegram_chat_id';
  if coalesce(v_tg, '') <> '' and coalesce(v_chat, '') <> '' then
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_tg || '/sendMessage',
      body := jsonb_build_object('chat_id', v_chat, 'parse_mode', 'HTML', 'disable_web_page_preview', true,
                                 'text', '<b>' || h(p_titulo) || '</b>' || chr(10) || h(p_msg)),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;

  -- OneSignal (push no celular)
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'onesignal_key' limit 1;
  select valor #>> '{}' into v_app from configuracoes where chave = 'onesignal_app_id';
  if coalesce(v_key, '') <> '' and coalesce(v_app, '') <> '' then
    v_txt := left(p_msg, 900);
    perform net.http_post(
      url := 'https://api.onesignal.com/notifications?c=push',
      body := jsonb_build_object('app_id', v_app, 'target_channel', 'push',
                                 'included_segments', jsonb_build_array('Total Subscriptions'),
                                 'headings', jsonb_build_object('en', p_titulo, 'pt', p_titulo),
                                 'contents', jsonb_build_object('en', v_txt, 'pt', v_txt),
                                 'url', 'https://silasfribeiro.github.io/yume/'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Key ' || v_key));
  end if;
exception when others then
  raise warning 'notificar falhou: %', sqlerrm;
end $$;

create or replace function notificar_teste() returns void language sql security definer set search_path = public as $$
  select notificar('🌿 Yume', 'Notificações funcionando! Este é um teste.', 'teste');
$$;

-- ---------- Venda / contagem + estoque baixo ----------
create or replace function notif_venda() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_local text; v_tipo_local text; v_itens text; v_qtd int; v_alertas text := ''; r record; v_total int; v_nolocal int;
begin
  select nome, tipo into v_local, v_tipo_local from locais where id = new.local_id;
  select string_agg(vi.quantidade || '× ' || coalesce(p.nome, '?'), chr(10) order by p.nome), sum(vi.quantidade)
    into v_itens, v_qtd
    from venda_itens vi left join produtos p on p.id = vi.produto_id where vi.venda_id = new.id;
  if v_qtd is null then return new; end if;

  if new.origem = 'contagem' then
    perform notificar('📋 Contagem do ' || coalesce(v_local, 'Box') || ': ' || brl(new.total),
      v_qtd || ' item(ns) vendidos desde a última contagem:' || chr(10) || v_itens, 'contagem');
  else
    perform notificar('💰 Venda ' || brl(new.total) || ' · ' || coalesce(v_local, 'Venda direta'),
      v_itens || case when new.desconto > 0 then chr(10) || 'Desconto: ' || brl(new.desconto) else '' end, 'venda');
  end if;

  -- Alertas de estoque para os produtos desta venda
  for r in select vi.produto_id, sum(vi.quantidade) q, p.nome, p.estoque_minimo
           from venda_itens vi join produtos p on p.id = vi.produto_id
           where vi.venda_id = new.id group by vi.produto_id, p.nome, p.estoque_minimo loop
    select coalesce(sum(quantidade), 0) into v_total from estoque_atual where produto_id = r.produto_id;
    if r.estoque_minimo > 0 and v_total <= r.estoque_minimo and v_total + r.q > r.estoque_minimo then
      v_alertas := v_alertas || '• ' || r.nome || ': restam ' || v_total || ' (mínimo ' || r.estoque_minimo || ')' || chr(10);
    elsif v_total <= 0 then
      v_alertas := v_alertas || '• ' || r.nome || ': ESGOTADO' || chr(10);
    end if;
    if v_tipo_local = 'box' then
      select coalesce(sum(quantidade), 0) into v_nolocal from estoque_atual where produto_id = r.produto_id and local_id = new.local_id;
      if v_nolocal <= 0 and v_total > 0 then
        v_alertas := v_alertas || '• ' || r.nome || ': acabou no ' || v_local || ' (tem ' || v_total || ' no estoque)' || chr(10);
      end if;
    end if;
  end loop;
  if v_alertas <> '' then
    perform notificar('⚠️ Estoque baixo', rtrim(v_alertas, chr(10)), 'estoque');
  end if;
  return new;
exception when others then
  raise warning 'notif_venda falhou: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notif_venda on vendas;
create trigger trg_notif_venda after update of total on vendas for each row execute function notif_venda();

-- ---------- Evento fechado ----------
create or replace function notif_evento() returns trigger language plpgsql security definer set search_path = public as $$
declare v_fat numeric; v_custo numeric; v_n int; v_itens int; v_top text;
begin
  if not (new.status = 'fechado' and old.status is distinct from 'fechado') then return new; end if;
  select coalesce(sum(total), 0), count(*) into v_fat, v_n from vendas where evento_id = new.id;
  select coalesce(sum(vi.quantidade * vi.custo_unit), 0), coalesce(sum(vi.quantidade), 0) into v_custo, v_itens
    from venda_itens vi join vendas v on v.id = vi.venda_id where v.evento_id = new.id;
  select string_agg(x.linha, chr(10)) into v_top from (
    select '• ' || p.nome || ': ' || sum(vi.quantidade) as linha
    from venda_itens vi join vendas v on v.id = vi.venda_id join produtos p on p.id = vi.produto_id
    where v.evento_id = new.id group by p.nome order by sum(vi.quantidade) desc limit 3) x;
  perform notificar('🎪 ' || new.nome || ' fechado!',
    'Faturamento: ' || brl(v_fat) || ' (' || v_n || ' vendas, ' || v_itens || ' itens)' || chr(10) ||
    'Lucro: ' || brl(v_fat - v_custo - coalesce(new.custo_mesa, 0)) ||
    coalesce(chr(10) || 'Mais vendidos:' || chr(10) || v_top, ''), 'evento');
  return new;
exception when others then
  raise warning 'notif_evento falhou: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notif_evento on eventos;
create trigger trg_notif_evento after update of status on eventos for each row execute function notif_evento();

-- ---------- Resumo semanal (segunda, 9h de Brasília) ----------
create or replace function resumo_semanal() returns void language plpgsql security definer set search_path = public as $$
declare
  v_fat numeric; v_n int; v_canais text; v_top text; v_baixo int; v_enc int; v_box uuid; v_dias int; v_msg text;
begin
  select coalesce(sum(total), 0), count(*) into v_fat, v_n from vendas where data >= now() - interval '7 days';
  select string_agg(x.l, chr(10)) into v_canais from (
    select '• ' || case canal when 'box' then 'Box' when 'evento' then 'Eventos' when 'online' then 'Loja online' else 'Venda direta' end
           || ': ' || brl(sum(total)) as l
    from vendas where data >= now() - interval '7 days' group by canal order by sum(total) desc) x;
  select string_agg(x.l, chr(10)) into v_top from (
    select '• ' || p.nome || ' (' || sum(vi.quantidade) || ')' as l
    from venda_itens vi join vendas v on v.id = vi.venda_id join produtos p on p.id = vi.produto_id
    where v.data >= now() - interval '7 days' group by p.nome order by sum(vi.quantidade) desc limit 3) x;
  select count(*) into v_baixo from produtos p where p.ativo and p.estoque_minimo > 0
    and coalesce((select sum(quantidade) from estoque_atual e where e.produto_id = p.id), 0) <= p.estoque_minimo;
  select id into v_box from locais where tipo = 'box' and ativo limit 1;
  select coalesce((valor #>> '{}')::int, 30) into v_dias from configuracoes where chave = 'encalhado_dias';
  select count(*) into v_enc from estoque_atual e where e.local_id = v_box and e.quantidade > 0
    and coalesce((select max(m.criado_em) from movimentacoes m where m.produto_id = e.produto_id and m.origem_id = v_box and m.tipo = 'venda'),
                 (select min(m.criado_em) from movimentacoes m where m.produto_id = e.produto_id and m.destino_id = v_box)) < now() - make_interval(days => coalesce(v_dias, 30));

  v_msg := 'Últimos 7 dias: ' || brl(v_fat) || ' em ' || v_n || ' venda(s)';
  if v_canais is not null then v_msg := v_msg || chr(10) || v_canais; end if;
  if v_top is not null then v_msg := v_msg || chr(10) || chr(10) || '⭐ Mais vendidos:' || chr(10) || v_top; end if;
  if v_baixo > 0 then v_msg := v_msg || chr(10) || chr(10) || '⚠️ ' || v_baixo || ' produto(s) com estoque baixo'; end if;
  if v_enc > 0 then v_msg := v_msg || chr(10) || '🐌 ' || v_enc || ' produto(s) encalhado(s) no Box'; end if;
  perform notificar('📊 Resumo da semana', v_msg, 'resumo');
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'yume-resumo-semanal';
select cron.schedule('yume-resumo-semanal', '0 12 * * 1', $$select public.resumo_semanal()$$);

-- ---------- Telegram: descobrir o grupo automaticamente ----------
-- 1) select telegram_buscar_chat();   2) espere 5s   3) select telegram_salvar_chat();
create or replace function telegram_buscar_chat() returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_tg text;
begin
  select decrypted_secret into v_tg from vault.decrypted_secrets where name = 'telegram_token' limit 1;
  if v_tg is null then raise exception 'Cadastre primeiro o token: select vault.create_secret(''TOKEN'', ''telegram_token'');'; end if;
  return net.http_get(url := 'https://api.telegram.org/bot' || v_tg || '/getUpdates');
end $$;

create or replace function telegram_salvar_chat() returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_body jsonb; v_chat text; v_nome text;
begin
  select content::jsonb into v_body from net._http_response
   where content like '%"ok":true%' and content like '%"chat"%' order by created desc limit 1;
  select c->>'id', coalesce(c->>'title', c->>'first_name') into v_chat, v_nome
    from jsonb_path_query(v_body, '$.result[*].*.chat') c
   where c->>'type' in ('group', 'supergroup')
   order by 1 limit 1;
  if v_chat is null then return 'Nenhum grupo encontrado. Mande um "oi" no grupo com o bot e tente de novo.'; end if;
  insert into configuracoes (chave, valor) values ('telegram_chat_id', to_jsonb(v_chat))
    on conflict (chave) do update set valor = excluded.valor;
  return 'Grupo salvo: ' || v_nome;
end $$;

-- ---------- Permissões ----------
revoke execute on function notificar(text, text, text) from public, anon;
revoke execute on function notificar_teste() from public, anon;
revoke execute on function resumo_semanal() from public, anon, authenticated;
revoke execute on function telegram_buscar_chat() from public, anon, authenticated;
revoke execute on function telegram_salvar_chat() from public, anon, authenticated;
grant execute on function notificar(text, text, text) to authenticated;
grant execute on function notificar_teste() to authenticated;
