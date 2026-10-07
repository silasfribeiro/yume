import { sb, S, q, cat, loc, est, locaisFixos, atelie, box, recarregarEstoque } from './db.js';
import { ic, esc, money, num, toast, vazio, fotoHTML, qtyHTML, bindQty, $ } from './ui.js';

// Permite abrir a tela já preenchida (ex.: "Repor no Box")
let preset = null;
export function abrirTransferencia(origemId, destinoId, itens = {}) {
  preset = { aba: 'transferencia', origem: origemId, destino: destinoId, itens };
  location.hash = '#/movimentar';
}

export async function render(el) {
  const st = preset || { aba: 'entrada', origem: atelie()?.id, destino: box()?.id, itens: {} };
  preset = null;
  let aba = st.aba, busca = '';
  const qtds = { ...st.itens }; // produto_id -> quantidade
  let origem = st.origem, destino = aba === 'entrada' ? atelie()?.id : st.destino, localAj = atelie()?.id;
  const locs = S.locais.filter(l => l.ativo !== false);
  const opt = (sel) => locs.map(l => `<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('');

  el.innerHTML = `
    <div class="page-head"><h1>Movimentar estoque</h1></div>
    <div class="tabs" id="tabs">
      <button data-a="entrada">Entrada</button>
      <button data-a="transferencia">Transferir</button>
      <button data-a="ajuste">Corrigir</button>
    </div>
    <div class="card" id="topo"></div>
    <div class="search field" style="margin-top:14px">${ic('search')}<input class="in" id="busca" placeholder="Filtrar produtos..."></div>
    <div class="card" id="lista"></div>
    <div style="height:70px"></div>`;

  const desenharTopo = () => {
    $('#tabs', el).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.a === aba));
    const t = $('#topo', el);
    if (aba === 'entrada') t.innerHTML = `<p class="small muted" style="margin-top:0">Para quando ela produz/recebe novos itens. Escolha onde eles vão ficar e as quantidades.</p>
      <label class="f">Adicionar em</label><select class="in" id="dest">${opt(destino)}</select>`;
    if (aba === 'transferencia') t.innerHTML = `<p class="small muted" style="margin-top:0">Ex.: levar do estoque principal para o Box. Só aparecem os produtos que existem no local de origem.</p>
      <div class="grid g2"><div><label class="f">De</label><select class="in" id="orig">${opt(origem)}</select></div>
      <div><label class="f">Para</label><select class="in" id="dest">${opt(destino)}</select></div></div>`;
    if (aba === 'ajuste') t.innerHTML = `<p class="small muted" style="margin-top:0">Contou e o número não bate? Digite a <b>quantidade real</b> e o app corrige (perda, brinde, defeito, etc.). Para vendas do Box, use a <a href="#/box/contagem">Contagem do Box</a>.</p>
      <label class="f">Local</label><select class="in" id="locaj">${opt(localAj)}</select>
      <input class="in" id="obsaj" placeholder="Motivo (opcional): perda, brinde, defeito..." style="margin-top:10px">`;
    const d = $('#dest', t), o = $('#orig', t), la = $('#locaj', t);
    if (d) d.onchange = () => { destino = d.value; };
    if (o) o.onchange = () => { origem = o.value; for (const k in qtds) delete qtds[k]; desenharLista(); };
    if (la) la.onchange = () => { localAj = la.value; for (const k in qtds) delete qtds[k]; desenharLista(); };
  };

  const produtosVisiveis = () => {
    const b = busca.toLowerCase();
    let ps = S.produtos.filter(p => p.ativo && (!b || (p.nome + ' ' + (p.sku || '') + ' ' + (p.variacao || '')).toLowerCase().includes(b)));
    if (aba === 'transferencia') ps = ps.filter(p => est(p.id, origem) > 0);
    return ps;
  };

  const desenharLista = () => {
    const ps = produtosVisiveis();
    const lista = $('#lista', el);
    if (!ps.length) { lista.innerHTML = vazio(aba === 'transferencia' ? 'Nenhum produto com estoque nesse local.' : 'Nenhum produto ativo encontrado.', 'package'); atualizarBarra(); return; }
    lista.innerHTML = `<div class="list">${ps.map(p => {
      const atual = aba === 'transferencia' ? est(p.id, origem) : aba === 'ajuste' ? est(p.id, localAj) : est(p.id, destino);
      const val = aba === 'ajuste' ? (qtds[p.id] ?? atual) : (qtds[p.id] || 0);
      return `<div class="li"><div class="thumb">${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy">` : ic('image')}</div>
        <div class="grow"><div style="font-weight:800">${esc(p.nome)}</div><div class="small muted">${esc(p.variacao || cat(p.categoria_id)?.nome || '')} · ${aba === 'transferencia' ? 'disponível' : 'atual'}: <b>${atual}</b></div></div>
        ${qtyHTML(p.id, val, 0, aba === 'transferencia' ? atual : '')}</div>`;
    }).join('')}</div>`;
    bindQty(lista, inp => {
      const v = Math.max(0, Number(inp.value) || 0);
      if (aba === 'ajuste') qtds[inp.name] = v; else if (v) qtds[inp.name] = v; else delete qtds[inp.name];
      atualizarBarra();
    });
    atualizarBarra();
  };

  const itensValidos = () => {
    if (aba === 'ajuste') return Object.entries(qtds).map(([id, v]) => ({ id, dif: v - est(id, localAj) })).filter(x => x.dif !== 0);
    return Object.entries(qtds).filter(([, v]) => v > 0);
  };

  let barra;
  const atualizarBarra = () => {
    if (!barra) { barra = document.createElement('div'); barra.className = 'cart-bar'; document.body.appendChild(barra); }
    const it = itensValidos();
    const total = aba === 'ajuste' ? it.length : it.reduce((s, [, v]) => s + v, 0);
    barra.innerHTML = `<div class="grow"><div class="num">${aba === 'ajuste' ? `${total} correção(ões)` : `${num(total)} un.`}</div><div class="small">${it.length} produto(s)</div></div>
      <button class="btn folha" id="salvar" ${it.length ? '' : 'disabled'}>${ic('check')}Confirmar</button>`;
    $('#salvar', barra).onclick = salvar;
  };

  const salvar = async () => {
    const b = $('#salvar', barra); b.disabled = true; b.textContent = 'Salvando...';
    try {
      if (aba === 'entrada') {
        await q(sb.rpc('registrar_movimentos', { p: { tipo: 'entrada', destino_id: destino, observacao: 'Produção', itens: itensValidos().map(([id, v]) => ({ produto_id: id, quantidade: v })) } }));
      } else if (aba === 'transferencia') {
        if (origem === destino) throw new Error('Origem e destino são iguais');
        await q(sb.rpc('registrar_movimentos', { p: { tipo: 'transferencia', origem_id: origem, destino_id: destino, itens: itensValidos().map(([id, v]) => ({ produto_id: id, quantidade: v })) } }));
      } else {
        const obs = $('#obsaj', el).value || 'Ajuste de contagem';
        const it = itensValidos();
        const sobe = it.filter(x => x.dif > 0), desce = it.filter(x => x.dif < 0);
        if (sobe.length) await q(sb.rpc('registrar_movimentos', { p: { tipo: 'ajuste', destino_id: localAj, observacao: obs, itens: sobe.map(x => ({ produto_id: x.id, quantidade: x.dif })) } }));
        if (desce.length) await q(sb.rpc('registrar_movimentos', { p: { tipo: 'ajuste', origem_id: localAj, observacao: obs, itens: desce.map(x => ({ produto_id: x.id, quantidade: -x.dif })) } }));
      }
      await recarregarEstoque();
      for (const k in qtds) delete qtds[k];
      toast('Estoque atualizado 🌿');
      desenharLista();
    } catch (e) { toast(e.message, true); atualizarBarra(); }
  };

  $('#tabs', el).onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    aba = b.dataset.a; for (const k in qtds) delete qtds[k];
    if (aba === 'entrada') destino = atelie()?.id;
    if (aba === 'transferencia') { origem = origem || atelie()?.id; destino = box()?.id; }
    desenharTopo(); desenharLista();
  };
  $('#busca', el).oninput = e => { busca = e.target.value; desenharLista(); };
  desenharTopo(); desenharLista();
}
