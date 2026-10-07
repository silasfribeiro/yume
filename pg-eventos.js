import { sb, S, q, prod, cat, est, atelie, localDoEvento, recarregarEstoque, carregarTudo, vendasPeriodo, pagNome } from './db.js';
import { ic, esc, money, num, toast, modal, confirmar, vazio, dataBR, parseNum, loading, $ } from './ui.js';
import { abrirTransferencia } from './pg-movimentar.js';

const statusNome = { planejado: 'Planejado', aberto: 'Acontecendo', fechado: 'Fechado' };

function formEvento(ev = null) {
  const d = ev || {};
  modal(`<div class="mh"><h2>${ev ? 'Editar evento' : 'Novo evento'}</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <form id="fe">
      <div class="field"><label class="f">Nome *</label><input class="in" name="nome" required value="${esc(d.nome || '')}" placeholder="Ex.: Artist Alley CCXP"></div>
      <div class="field"><label class="f">Local</label><input class="in" name="lugar" value="${esc(d.lugar || '')}" placeholder="Ex.: São Paulo Expo"></div>
      <div class="grid g2"><div class="field"><label class="f">Início</label><input class="in" type="date" name="data_inicio" value="${d.data_inicio || ''}"></div>
        <div class="field"><label class="f">Fim</label><input class="in" type="date" name="data_fim" value="${d.data_fim || ''}"></div></div>
      <div class="field"><label class="f">Custo da mesa / inscrição (R$)</label><input class="in" name="custo_mesa" inputmode="decimal" value="${d.custo_mesa ? String(d.custo_mesa).replace('.', ',') : ''}" placeholder="0,00"></div>
      <div class="field"><label class="f">Observações</label><textarea class="in" name="observacoes">${esc(d.observacoes || '')}</textarea></div>
      <button class="btn full">${ic('check')}Salvar</button></form>`, {
    onMount: (m, close) => $('#fe', m).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      const reg = { nome: f.get('nome').trim(), lugar: f.get('lugar').trim() || null, data_inicio: f.get('data_inicio') || null, data_fim: f.get('data_fim') || f.get('data_inicio') || null, custo_mesa: parseNum(f.get('custo_mesa')), observacoes: f.get('observacoes').trim() || null };
      try {
        let id = ev?.id;
        if (ev) await q(sb.from('eventos').update(reg).eq('id', ev.id));
        else { const [r] = await q(sb.from('eventos').insert(reg).select()); id = r.id; }
        await carregarTudo(); close(); toast('Evento salvo');
        location.hash = `#/evento/${id}`; window.rotear();
      } catch (err) { toast(err.message, true); }
    }
  });
}

export async function renderLista(el, _, vivo) {
  // faturamento por evento
  const vendas = await q(sb.from('vendas').select('evento_id,total').not('evento_id', 'is', null));
  if (!vivo()) return;
  const fat = {}; vendas.forEach(v => fat[v.evento_id] = (fat[v.evento_id] || 0) + Number(v.total));
  el.innerHTML = `
    <div class="page-head"><h1>Eventos</h1><button class="btn sm" id="novo">${ic('plus')}Novo evento</button></div>
    ${S.eventos.length ? `<div class="grid g2 stack-sm">${S.eventos.map(ev => `
      <a class="card" href="#/evento/${ev.id}" style="text-decoration:none;display:block">
        <div class="row between"><h3>${esc(ev.nome)}</h3><span class="badge ${ev.status === 'aberto' ? '' : ev.status === 'fechado' ? 'nevoa' : 'manteiga'}">${statusNome[ev.status]}</span></div>
        <div class="small muted">${ev.data_inicio ? dataBR(ev.data_inicio + 'T12:00') : 'Sem data'}${ev.data_fim && ev.data_fim !== ev.data_inicio ? ' a ' + dataBR(ev.data_fim + 'T12:00') : ''}${ev.lugar ? ' · ' + esc(ev.lugar) : ''}</div>
        <div class="row between" style="margin-top:10px"><span class="small">Faturamento</span><span class="num">${money(fat[ev.id] || 0)}</span></div>
      </a>`).join('')}</div>`
      : vazio('Nenhum evento cadastrado ainda.<br>Cadastre o próximo artist alley pra montar a mala e usar o caixa rápido ✨', 'calendar', `<button class="btn" id="novo2">${ic('plus')}Cadastrar evento</button>`)}`;
  $('#novo', el).onclick = () => formEvento();
  const n2 = $('#novo2', el); if (n2) n2.onclick = () => formEvento();
}

export async function renderDetalhe(el, id, vivo) {
  const ev = S.eventos.find(e => e.id === id);
  if (!ev) { el.innerHTML = vazio('Evento não encontrado.', 'search', `<a class="btn" href="#/eventos">Voltar</a>`); return; }
  const L = localDoEvento(ev.id), A = atelie();
  const vendas = await vendasPeriodo(new Date('2000-01-01'), new Date('2100-01-01'), x => x.eq('evento_id', ev.id));
  if (!vivo()) return;

  const itens = vendas.flatMap(v => v.venda_itens);
  const fat = vendas.reduce((s, v) => s + Number(v.total), 0);
  const custoProd = itens.reduce((s, i) => s + i.quantidade * Number(i.custo_unit), 0);
  const lucro = fat - custoProd - Number(ev.custo_mesa || 0);
  const un = itens.reduce((s, i) => s + i.quantidade, 0);
  const mala = L ? S.estoque.filter(e => e.local_id === L.id && e.quantidade > 0) : [];
  const unMala = mala.reduce((s, e) => s + e.quantidade, 0);
  const porP = {}; itens.forEach(i => { const r = porP[i.produto_id] ||= { q: 0, v: 0 }; r.q += i.quantidade; r.v += i.quantidade * i.preco_unit; });
  const top = Object.entries(porP).sort((a, b) => b[1].q - a[1].q).slice(0, 10);
  const porPag = {}; vendas.forEach(v => porPag[v.forma_pagamento] = (porPag[v.forma_pagamento] || 0) + Number(v.total));
  const porDia = {}; vendas.forEach(v => { const d = new Date(v.data).toLocaleDateString('pt-BR'); porDia[d] = (porDia[d] || 0) + Number(v.total); });

  // comparação com outros eventos fechados
  let comp = '';
  const outros = S.eventos.filter(e => e.id !== ev.id && e.status === 'fechado');
  if (outros.length) {
    const vs = await q(sb.from('vendas').select('evento_id,total').in('evento_id', outros.map(o => o.id)));
    if (!vivo()) return;
    const f = {}; vs.forEach(v => f[v.evento_id] = (f[v.evento_id] || 0) + Number(v.total));
    const lista = [{ e: ev, v: fat }, ...outros.map(o => ({ e: o, v: f[o.id] || 0 }))].sort((a, b) => b.v - a.v);
    const mx = Math.max(1, ...lista.map(x => x.v));
    comp = `<div class="card" style="margin-top:14px"><h3>Comparando com outros eventos</h3>${lista.slice(0, 8).map(x => `<div style="margin:8px 0"><div class="row between small"><b>${esc(x.e.nome)}${x.e.id === ev.id ? ' (este)' : ''}</b><span>${money(x.v)}</span></div><div class="bar-h"><span style="width:${x.v / mx * 100}%;${x.e.id === ev.id ? 'background:var(--oliva)' : ''}"></span></div></div>`).join('')}</div>`;
  }

  el.innerHTML = `
    <div class="page-head"><a class="btn ghost sm" href="#/eventos">${ic('back')}Eventos</a>
      <button class="btn ghost sm" id="ed">${ic('edit')}Editar</button></div>
    <div class="row between"><div><h1>${esc(ev.nome)}</h1><div class="muted small">${ev.data_inicio ? dataBR(ev.data_inicio + 'T12:00') : ''}${ev.lugar ? ' · ' + esc(ev.lugar) : ''}</div></div>
      <span class="badge ${ev.status === 'aberto' ? '' : ev.status === 'fechado' ? 'nevoa' : 'manteiga'}">${statusNome[ev.status]}</span></div>

    ${ev.status !== 'fechado' ? `
    <div class="card" style="margin-top:14px">
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="badge ${ev.status === 'planejado' ? 'oliva' : 'nevoa'}">1. Antes</span><span class="badge ${ev.status === 'aberto' ? 'oliva' : 'nevoa'}">2. Durante</span><span class="badge nevoa">3. Depois</span></div>
      <div class="grid g3">
        <button class="btn sec" id="mala">${ic('package')}Montar a mala</button>
        <a class="btn" href="#/caixa/${L?.id}">${ic('cart')}Abrir caixa rápido</a>
        <button class="btn sec" id="fechar">${ic('check')}Fechar evento</button>
      </div>
      <p class="small muted" style="margin:10px 0 0">Na mala: <b>${num(unMala)}</b> unidade(s) de ${mala.length} produto(s).</p>
    </div>` : ''}

    <div class="grid g4" style="margin-top:14px">
      <div class="stat verde"><div class="lbl">Faturamento</div><div class="num">${money(fat)}</div><div class="small">${vendas.length} vendas · ${un} itens</div></div>
      <div class="stat ${lucro >= 0 ? '' : 'destaque'}"><div class="lbl">Lucro</div><div class="num">${money(lucro)}</div><div class="small">menos produtos e mesa</div></div>
      <div class="stat"><div class="lbl">Custo da mesa</div><div class="num">${money(ev.custo_mesa)}</div></div>
      <div class="stat"><div class="lbl">Ticket médio</div><div class="num">${money(vendas.length ? fat / vendas.length : 0)}</div></div>
    </div>

    <div class="grid g2 stack-sm" style="margin-top:14px;align-items:start">
      <div class="card"><h3>Mais vendidos</h3>${top.length ? `<div class="list">${top.map(([pid, r]) => { const p = prod(pid); return `<div class="li"><div class="thumb">${p?.foto_url ? `<img src="${esc(p.foto_url)}">` : ic('image')}</div><div class="grow"><b>${esc(p?.nome || '—')}</b><div class="small muted">${money(r.v)}</div></div><b>${r.q}</b></div>`; }).join('')}</div>` : '<p class="muted small">Ainda sem vendas.</p>'}</div>
      <div class="stack">
        <div class="card"><h3>Por forma de pagamento</h3>${Object.keys(porPag).length ? Object.entries(porPag).map(([k, v]) => `<div class="li"><span class="grow">${pagNome[k] || k}</span><b>${money(v)}</b></div>`).join('') : '<p class="muted small">—</p>'}</div>
        ${Object.keys(porDia).length > 1 ? `<div class="card"><h3>Por dia</h3>${Object.entries(porDia).map(([k, v]) => `<div class="li"><span class="grow">${k}</span><b>${money(v)}</b></div>`).join('')}</div>` : ''}
        ${mala.length ? `<div class="card"><h3>Ainda na mala</h3>${mala.map(e => `<div class="li"><span class="grow">${esc(prod(e.produto_id)?.nome || '')}</span><b>${e.quantidade}</b></div>`).join('')}</div>` : ''}
      </div>
    </div>
    ${comp}
    ${ev.observacoes ? `<div class="card" style="margin-top:14px"><h3>Observações</h3><p style="white-space:pre-wrap;margin:6px 0 0">${esc(ev.observacoes)}</p></div>` : ''}
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost sm" id="del" style="color:var(--erro)">${ic('trash')}Excluir evento</button></div>`;

  $('#ed', el).onclick = () => formEvento(ev);
  const mb = $('#mala', el); if (mb) mb.onclick = async () => {
    if (ev.status === 'planejado') { await q(sb.from('eventos').update({ status: 'aberto' }).eq('id', ev.id)); ev.status = 'aberto'; }
    abrirTransferencia(A?.id, L.id);
  };
  const cx = el.querySelector(`a[href="#/caixa/${L?.id}"]`);
  if (cx && ev.status === 'planejado') cx.addEventListener('click', () => { q(sb.from('eventos').update({ status: 'aberto' }).eq('id', ev.id)); ev.status = 'aberto'; });
  const fb = $('#fechar', el); if (fb) fb.onclick = async () => {
    if (!(await confirmar(`Fechar o evento? Tudo que sobrou na mala (<b>${unMala} un.</b>) volta para o <b>${esc(A?.nome || 'estoque principal')}</b>.`, { ok: 'Fechar evento' }))) return;
    try {
      await q(sb.rpc('fechar_evento', { p_evento: ev.id, p_destino: A.id }));
      await carregarTudo(); toast('Evento fechado! Bom trabalho ✨'); window.rotear();
    } catch (e) { toast(e.message, true); }
  };
  $('#del', el).onclick = async () => {
    if (vendas.length) { toast('Esse evento tem vendas registradas. Exclua as vendas primeiro (em Vendas).', true); return; }
    if (unMala) { toast('Ainda tem itens na mala. Feche o evento primeiro para devolvê-los.', true); return; }
    if (!(await confirmar(`Excluir o evento <b>${esc(ev.nome)}</b>?`, { ok: 'Excluir', perigo: true }))) return;
    try { await q(sb.from('eventos').delete().eq('id', ev.id)); await carregarTudo(); toast('Evento excluído'); location.hash = '#/eventos'; }
    catch (e) { toast(/foreign key|violates/i.test(e.message) ? 'Esse evento já teve movimentação de estoque e fica guardado no histórico.' : e.message, true); }
  };
}
