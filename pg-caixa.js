import { sb, S, q, cat, loc, est, prod, canalDoLocal, recarregarEstoque, pagNome } from './db.js';
import { ic, esc, money, num, toast, modal, vazio, parseNum, $ } from './ui.js';

export async function render(el, localId, vivo) {
  const local = loc(localId);
  if (!local) { el.innerHTML = vazio('Local não encontrado.', 'search', `<a class="btn" href="#/vendas">Voltar</a>`); return; }
  const evento = local.evento_id ? S.eventos.find(e => e.id === local.evento_id) : null;
  const voltar = evento ? `#/evento/${evento.id}` : local.tipo === 'box' ? '#/box' : '#/vendas';
  let canal = canalDoLocal(local);
  const carrinho = {}; // produto_id -> qtd
  let busca = '', catF = '';

  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  let totalDia = 0, vendasDia = 0;
  const carregarDia = async () => {
    const vs = await q(sb.from('vendas').select('total').eq('local_id', local.id).gte('data', hoje0.toISOString()));
    totalDia = vs.reduce((s, v) => s + Number(v.total), 0); vendasDia = vs.length;
  };
  await carregarDia();
  if (!vivo()) return;

  el.innerHTML = `
    <div class="page-head"><a class="btn ghost sm" href="${voltar}">${ic('back')}Voltar</a></div>
    <div class="row between" style="margin-bottom:12px">
      <div><h1>Caixa rápido</h1><div class="muted">${esc(local.nome)}</div></div>
      <div class="stat verde" style="padding:10px 14px;text-align:right"><div class="lbl">Vendido hoje</div><div class="num" id="tdia">${money(totalDia)}</div><div class="small" id="vdia">${vendasDia} venda(s)</div></div>
    </div>
    ${local.tipo === 'atelie' ? `<div class="tabs" id="canal" style="max-width:360px"><button data-c="atelie" class="on">Venda direta</button><button data-c="online">Loja online</button></div>` : ''}
    <div class="search field">${ic('search')}<input class="in" id="busca" placeholder="Buscar produto..."></div>
    <div class="chips field" id="chips"><button class="chip on" data-c="">Todos</button>${S.categorias.map(c => `<button class="chip" data-c="${c.id}">${esc(c.nome)}</button>`).join('')}</div>
    <div id="grade"></div><div style="height:90px"></div>`;

  const disp = id => est(id, local.id) - (carrinho[id] || 0);

  const desenhar = () => {
    const b = busca.toLowerCase();
    const ps = S.produtos.filter(p => p.ativo && est(p.id, local.id) > 0 && (!catF || p.categoria_id === catF) && (!b || (p.nome + ' ' + (p.sku || '') + ' ' + (p.variacao || '')).toLowerCase().includes(b)));
    $('#grade', el).innerHTML = ps.length ? `<div class="pos-grid">${ps.map(p => {
      const n = carrinho[p.id] || 0, d = disp(p.id);
      return `<button class="pos-item ${n ? 'sel' : ''} ${d <= 0 ? 'esgotado' : ''}" data-id="${p.id}">
        ${n ? `<span class="qtd-badge">${n}</span>` : ''}<span class="disp badge nevoa">${d}</span>
        <div class="foto">${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy">` : ic('image')}</div>
        <div class="t1">${esc(p.nome)}</div><div class="t2">${money(p.preco)}</div></button>`;
    }).join('')}</div>`
      : vazio(`Nenhum produto com estoque em <b>${esc(local.nome)}</b>.${evento ? '<br>Monte a mala do evento primeiro.' : ''}`, 'package',
        evento ? `<a class="btn" href="${voltar}">Montar a mala</a>` : `<a class="btn" href="#/movimentar">Movimentar estoque</a>`);
  };

  let barra = document.createElement('div'); barra.className = 'cart-bar'; document.body.appendChild(barra);
  const atualizarBarra = () => {
    const itens = Object.entries(carrinho).filter(([, v]) => v > 0);
    const total = itens.reduce((s, [id, v]) => s + v * prod(id).preco, 0);
    const un = itens.reduce((s, [, v]) => s + v, 0);
    barra.innerHTML = `<button class="btn ghost" id="ver" style="color:var(--creme);padding:0" ${un ? '' : 'disabled'}>${ic('cart')}</button>
      <div class="grow"><div class="num">${money(total)}</div><div class="small">${un} item(ns)</div></div>
      ${un ? `<button class="btn ghost sm" id="limpar" style="color:var(--creme)">Limpar</button>` : ''}
      <button class="btn folha" id="fin" ${un ? '' : 'disabled'}>Finalizar</button>`;
    const l = $('#limpar', barra); if (l) l.onclick = () => { for (const k in carrinho) delete carrinho[k]; desenhar(); atualizarBarra(); };
    $('#fin', barra).onclick = finalizar;
    $('#ver', barra).onclick = finalizar;
  };

  const finalizar = () => {
    const itens = Object.entries(carrinho).filter(([, v]) => v > 0).map(([id, v]) => ({ p: prod(id), q: v }));
    if (!itens.length) return;
    const sub = itens.reduce((s, x) => s + x.q * x.p.preco, 0);
    let pag = 'pix';
    modal(`
      <div class="mh"><h2>Finalizar venda</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
      <div class="list" id="itens">${itens.map(x => `<div class="li" data-id="${x.p.id}"><div class="grow"><b>${esc(x.p.nome)}</b><div class="small muted">${money(x.p.preco)} cada</div></div>
        <span class="qty"><button type="button" data-d="-1">−</button><input value="${x.q}" readonly><button type="button" data-d="1">+</button></span>
        <b style="min-width:76px;text-align:right">${money(x.q * x.p.preco)}</b></div>`).join('')}</div>
      <div class="grid g2" style="margin-top:12px">
        <div class="field"><label class="f">Desconto (R$)</label><input class="in" id="desc" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label class="f">Data</label><input class="in" id="dt" type="datetime-local"></div>
      </div>
      <label class="f">Forma de pagamento</label>
      <div class="chips field" id="pags">${Object.entries(pagNome).map(([k, n]) => `<button type="button" class="chip ${k === pag ? 'on' : ''}" data-p="${k}">${n}</button>`).join('')}</div>
      <div class="field"><input class="in" id="obs" placeholder="Observação (opcional)"></div>
      <div class="row between" style="margin:8px 0 14px"><span class="muted">Total</span><span class="num" style="font-size:1.6rem" id="tot">${money(sub)}</span></div>
      <button class="btn full" id="ok">${ic('check')}Confirmar venda</button>`, {
      onMount: (m, close) => {
        const agora = new Date(); agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
        $('#dt', m).value = agora.toISOString().slice(0, 16);
        const recalcular = () => {
          const s = Object.entries(carrinho).reduce((a, [id, v]) => a + v * prod(id).preco, 0);
          $('#tot', m).textContent = money(Math.max(0, s - parseNum($('#desc', m).value)));
        };
        $('#desc', m).oninput = recalcular;
        $('#itens', m).onclick = e => {
          const b = e.target.closest('[data-d]'); if (!b) return;
          const li = b.closest('[data-id]'); const id = li.dataset.id;
          const nv = Math.max(0, Math.min(est(id, local.id), (carrinho[id] || 0) + Number(b.dataset.d)));
          carrinho[id] = nv;
          li.querySelector('input').value = nv;
          li.querySelector('b:last-child').textContent = money(nv * prod(id).preco);
          recalcular(); desenhar(); atualizarBarra();
        };
        $('#pags', m).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pag = b.dataset.p; $('#pags', m).querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); };
        $('#ok', m).onclick = async () => {
          const its = Object.entries(carrinho).filter(([, v]) => v > 0);
          if (!its.length) { close(); return; }
          const b = $('#ok', m); b.disabled = true; b.textContent = 'Registrando...';
          try {
            const dt = $('#dt', m).value ? new Date($('#dt', m).value) : new Date();
            await q(sb.rpc('registrar_venda', { p: {
              local_id: local.id, canal, evento_id: evento?.id || null, forma_pagamento: pag,
              desconto: parseNum($('#desc', m).value), origem: 'caixa', observacao: $('#obs', m).value || null,
              data: dt.toISOString(),
              itens: its.map(([id, v]) => ({ produto_id: id, quantidade: v, preco_unit: prod(id).preco })) } }));
            await recarregarEstoque();
            for (const k in carrinho) delete carrinho[k];
            close(); toast('Venda registrada! ✨');
            await carregarDia();
            $('#tdia', el).textContent = money(totalDia); $('#vdia', el).textContent = `${vendasDia} venda(s)`;
            desenhar(); atualizarBarra();
          } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Confirmar venda'; }
        };
      }
    });
  };

  $('#grade', el).onclick = e => {
    const b = e.target.closest('.pos-item'); if (!b) return;
    const id = b.dataset.id;
    if (disp(id) <= 0) { toast('Acabou o estoque desse aqui', true); return; }
    carrinho[id] = (carrinho[id] || 0) + 1;
    desenhar(); atualizarBarra();
  };
  $('#grade', el).oncontextmenu = e => {
    const b = e.target.closest('.pos-item'); if (!b) return; e.preventDefault();
    const id = b.dataset.id; if (carrinho[id]) { carrinho[id]--; desenhar(); atualizarBarra(); }
  };
  $('#busca', el).oninput = e => { busca = e.target.value; desenhar(); };
  $('#chips', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; catF = b.dataset.c; $('#chips', el).querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); desenhar(); };
  const cn = $('#canal', el); if (cn) cn.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; canal = b.dataset.c; cn.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  desenhar(); atualizarBarra();
}
