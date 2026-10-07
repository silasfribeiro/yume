import { sb, S, q, cat, col, loc, prod, est, estTotal, estPorLocal, estoqueBaixo, atelie, locaisFixos, recarregarEstoque, recarregarProdutos, uploadFoto, canalNome } from './db.js';
import { ic, esc, money, num, toast, modal, confirmar, vazio, fotoHTML, parseNum, redimensionar, baixarArquivo, csv, dataHoraBR, qtyHTML, bindQty, $ } from './ui.js';

const filtro = { busca: '', cat: '', col: '', local: '', inativos: false };

export function cardProduto(p, extra = '') {
  const c = cat(p.categoria_id);
  const total = estTotal(p.id);
  return `<a class="prod ${p.ativo ? '' : 'inativo'}" href="#/produto/${p.id}">
    ${estoqueBaixo(p) ? `<span class="alerta badge manteiga">${ic('alert')}baixo</span>` : ''}
    ${fotoHTML(p.foto_url)}
    <div class="info">
      <div class="nome">${esc(p.nome)}</div>
      ${p.variacao ? `<div class="small muted">${esc(p.variacao)}</div>` : ''}
      <div class="row between" style="margin-top:auto">
        <span class="preco">${money(p.preco)}</span>
        <span class="small"><b>${num(total)}</b> un.</span>
      </div>
      ${c ? `<div><span class="badge" style="background:${esc(c.cor || '#A6C969')}">${esc(c.nome)}</span></div>` : ''}
      ${extra}
    </div></a>`;
}

export async function renderLista(el) {
  const lista = () => {
    const b = filtro.busca.trim().toLowerCase();
    return S.produtos.filter(p =>
      (filtro.inativos || p.ativo) &&
      (!filtro.cat || p.categoria_id === filtro.cat) &&
      (!filtro.col || p.colecao_id === filtro.col) &&
      (!filtro.local || est(p.id, filtro.local) > 0) &&
      (!b || [p.nome, p.sku, p.variacao, cat(p.categoria_id)?.nome, col(p.colecao_id)?.nome].join(' ').toLowerCase().includes(b)));
  };

  el.innerHTML = `
    <div class="page-head"><h1>Produtos</h1>
      <div class="row">
        <a class="btn sec sm" href="#/movimentar">${ic('swap')}Movimentar</a>
        <button class="btn sec sm" id="exp">${ic('download')}CSV</button>
        <button class="btn sm" id="novo">${ic('plus')}Novo</button>
      </div></div>
    <div class="search field">${ic('search')}<input class="in" id="busca" placeholder="Buscar por nome, código, coleção..." value="${esc(filtro.busca)}"></div>
    <div class="chips field" id="chips">
      <button class="chip ${!filtro.cat ? 'on' : ''}" data-c="">Todas</button>
      ${S.categorias.map(c => `<button class="chip ${filtro.cat === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.nome)}</button>`).join('')}
    </div>
    <div class="row field">
      <select class="in grow" id="fcol" style="max-width:240px"><option value="">Todas as coleções</option>${S.colecoes.map(c => `<option value="${c.id}" ${filtro.col === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
      <select class="in grow" id="floc" style="max-width:240px"><option value="">Todos os locais</option>${S.locais.filter(l => l.ativo !== false).map(l => `<option value="${l.id}" ${filtro.local === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select>
      <label class="row small" style="gap:6px"><input type="checkbox" id="finat" ${filtro.inativos ? 'checked' : ''}> Mostrar inativos</label>
    </div>
    <div id="grade"></div>`;

  const desenhar = () => {
    const l = lista();
    $('#grade', el).innerHTML = S.produtos.length === 0
      ? vazio('Nenhum produto por aqui ainda 🌿<br>Que tal cadastrar o primeiro?', 'leaf', `<button class="btn" id="novo2">${ic('plus')}Cadastrar produto</button>`)
      : l.length === 0 ? vazio('Nenhum produto encontrado com esses filtros.', 'search')
        : `<p class="small muted" style="margin:0 0 8px">${l.length} produto(s)</p><div class="prod-grid">${l.map(p => cardProduto(p)).join('')}</div>`;
    const n2 = $('#novo2', el); if (n2) n2.onclick = () => formProduto();
  };
  desenhar();

  $('#busca', el).oninput = e => { filtro.busca = e.target.value; desenhar(); };
  $('#chips', el).onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    filtro.cat = b.dataset.c;
    $('#chips', el).querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
    desenhar();
  };
  $('#fcol', el).onchange = e => { filtro.col = e.target.value; desenhar(); };
  $('#floc', el).onchange = e => { filtro.local = e.target.value; desenhar(); };
  $('#finat', el).onchange = e => { filtro.inativos = e.target.checked; desenhar(); };
  $('#novo', el).onclick = () => formProduto();
  $('#exp', el).onclick = exportarEstoque;

  const fab = document.createElement('button');
  fab.className = 'btn fab so-mobile'; fab.innerHTML = ic('plus'); fab.title = 'Novo produto';
  fab.onclick = () => formProduto();
  document.body.appendChild(fab);
}

function exportarEstoque() {
  const locs = S.locais.filter(l => l.ativo !== false);
  const linhas = [['Produto', 'Variação', 'Código', 'Categoria', 'Coleção', 'Preço', 'Custo', 'Ativo', ...locs.map(l => l.nome), 'Total', 'Valor em estoque (venda)', 'Valor em estoque (custo)']];
  S.produtos.forEach(p => {
    const t = estTotal(p.id);
    linhas.push([p.nome, p.variacao, p.sku, cat(p.categoria_id)?.nome, col(p.colecao_id)?.nome,
      String(p.preco).replace('.', ','), String(p.custo).replace('.', ','), p.ativo ? 'sim' : 'não',
      ...locs.map(l => est(p.id, l.id)), t, (t * p.preco).toFixed(2).replace('.', ','), (t * p.custo).toFixed(2).replace('.', ',')]);
  });
  baixarArquivo(`estoque-yume-${new Date().toISOString().slice(0, 10)}.csv`, csv(linhas));
}

export function formProduto(p = null, { duplicar = false } = {}) {
  const novo = !p || duplicar;
  const d = p ? { ...p } : { ativo: true, preco: '', custo: '', estoque_minimo: 0 };
  if (duplicar) { d.nome = d.nome + ' (cópia)'; d.sku = ''; }
  let fotoBlob = null; let fotoUrl = d.foto_url || '';
  const nf = v => v === '' || v == null ? '' : String(v).replace('.', ',');

  modal(`
    <div class="mh"><h2>${duplicar ? 'Duplicar produto' : novo ? 'Novo produto' : 'Editar produto'}</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <form id="fp">
      <label class="foto-up" id="fotoUp">${fotoUrl ? `<img src="${esc(fotoUrl)}">` : `<div style="text-align:center">${ic('image')}<div class="small">Adicionar foto</div></div>`}
        <input type="file" accept="image/*" hidden id="fotoIn"></label>
      ${fotoUrl ? `<div style="text-align:center;margin:-6px 0 10px"><button type="button" class="btn ghost sm" id="semFoto">Remover foto</button></div>` : ''}
      <div class="field"><label class="f">Nome *</label><input class="in" name="nome" required value="${esc(d.nome || '')}" placeholder="Ex.: Boton Gatinho Bruxo"></div>
      <div class="grid g2 stack-sm">
        <div class="field"><label class="f">Categoria</label><select class="in" name="categoria_id"><option value="">—</option>${S.categorias.map(c => `<option value="${c.id}" ${d.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
        <div class="field"><label class="f">Coleção</label><select class="in" name="colecao_id"><option value="">—</option>${S.colecoes.map(c => `<option value="${c.id}" ${d.colecao_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}<option value="__nova">+ Nova coleção...</option></select></div>
      </div>
      <div class="grid g2 stack-sm">
        <div class="field"><label class="f">Tamanho / variação</label><input class="in" name="variacao" value="${esc(d.variacao || '')}" placeholder="Ex.: 5x5cm holográfico"></div>
        <div class="field"><label class="f">Código (SKU)</label><input class="in" name="sku" value="${esc(d.sku || '')}" placeholder="Ex.: BOT-012"></div>
      </div>
      <div class="grid g3">
        <div class="field"><label class="f">Preço (R$) *</label><input class="in" name="preco" inputmode="decimal" required value="${nf(d.preco)}" placeholder="0,00"></div>
        <div class="field"><label class="f">Custo (R$)</label><input class="in" name="custo" inputmode="decimal" value="${nf(d.custo)}" placeholder="0,00"></div>
        <div class="field"><label class="f">Estoque mín.</label><input class="in" name="estoque_minimo" type="number" inputmode="numeric" min="0" value="${d.estoque_minimo ?? 0}"></div>
      </div>
      ${novo ? `<div class="card" style="background:var(--nevoa);box-shadow:none;margin-bottom:12px">
        <label class="f">Estoque inicial</label>
        <div class="row">${qtyHTML('qtd_inicial', 0, 0)}<span>em</span>
          <select class="in grow" name="local_inicial">${locaisFixos().map(l => `<option value="${l.id}" ${l.tipo === 'atelie' ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div></div>` : ''}
      <div class="field"><label class="f">Observações</label><textarea class="in" name="observacoes">${esc(d.observacoes || '')}</textarea></div>
      <label class="row field"><input type="checkbox" name="ativo" ${d.ativo !== false ? 'checked' : ''}> Produto ativo (aparece nas vendas)</label>
      <button class="btn full" type="submit">${ic('check')}Salvar</button>
    </form>`, {
    onMount: (m, close) => {
      bindQty(m);
      const fin = $('#fotoIn', m);
      fin.onchange = async () => {
        const f = fin.files[0]; if (!f) return;
        try { fotoBlob = await redimensionar(f); } catch { toast('Não consegui ler essa imagem', true); return; }
        $('#fotoUp', m).querySelector('img, div')?.remove();
        const img = document.createElement('img'); img.src = URL.createObjectURL(fotoBlob);
        $('#fotoUp', m).prepend(img);
      };
      const sf = $('#semFoto', m); if (sf) sf.onclick = () => { fotoUrl = ''; fotoBlob = null; $('#fotoUp', m).querySelector('img')?.remove(); sf.remove(); };
      const selCol = m.querySelector('[name=colecao_id]');
      selCol.onchange = async () => {
        if (selCol.value !== '__nova') return;
        const nome = prompt('Nome da nova coleção:');
        if (!nome) { selCol.value = ''; return; }
        try {
          const [c] = await q(sb.from('colecoes').insert({ nome: nome.trim() }).select());
          S.colecoes.push(c); S.colecoes.sort((a, b) => a.nome.localeCompare(b.nome));
          const o = new Option(c.nome, c.id, true, true); selCol.insertBefore(o, selCol.lastElementChild);
        } catch (e) { toast(e.message, true); selCol.value = ''; }
      };
      $('#fp', m).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Salvando...';
        try {
          if (fotoBlob) fotoUrl = await uploadFoto(fotoBlob);
          const reg = {
            nome: f.get('nome').trim(), categoria_id: f.get('categoria_id') || null,
            colecao_id: (f.get('colecao_id') && f.get('colecao_id') !== '__nova') ? f.get('colecao_id') : null,
            variacao: f.get('variacao').trim() || null, sku: f.get('sku').trim() || null,
            preco: parseNum(f.get('preco')), custo: parseNum(f.get('custo')),
            estoque_minimo: Number(f.get('estoque_minimo')) || 0, observacoes: f.get('observacoes').trim() || null,
            ativo: !!f.get('ativo'), foto_url: fotoUrl || null,
          };
          let id = p?.id;
          if (novo) {
            const [r] = await q(sb.from('produtos').insert(reg).select()); id = r.id;
            const qi = Number(f.get('qtd_inicial')) || 0;
            if (qi > 0) await q(sb.rpc('registrar_movimentos', { p: { tipo: 'entrada', destino_id: f.get('local_inicial'), observacao: 'Estoque inicial', itens: [{ produto_id: id, quantidade: qi }] } }));
          } else {
            await q(sb.from('produtos').update(reg).eq('id', id));
          }
          await Promise.all([recarregarProdutos(), recarregarEstoque()]);
          close(); toast('Produto salvo 🌿');
          if (novo) location.hash = `#/produto/${id}`; else window.rotear();
        } catch (err) { toast(err.message, true); btn.disabled = false; btn.innerHTML = 'Salvar'; }
      };
    }
  });
}

export function entradaRapida(p) {
  modal(`
    <div class="mh"><h2>Dar entrada</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <p class="muted" style="margin-top:0">${esc(p.nome)}: nova produção ou reposição</p>
    <form id="fe">
      <div class="row field">${qtyHTML('qtd', 1, 1)}<span>em</span>
        <select class="in grow" name="local">${locaisFixos().map(l => `<option value="${l.id}" ${l.tipo === 'atelie' ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
      <div class="field"><input class="in" name="obs" placeholder="Observação (opcional)"></div>
      <button class="btn full">${ic('plus')}Adicionar ao estoque</button>
    </form>`, {
    onMount: (m, close) => {
      bindQty(m);
      $('#fe', m).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target);
        try {
          await q(sb.rpc('registrar_movimentos', { p: { tipo: 'entrada', destino_id: f.get('local'), observacao: f.get('obs') || 'Produção', itens: [{ produto_id: p.id, quantidade: Number(f.get('qtd')) }] } }));
          await recarregarEstoque(); close(); toast('Estoque atualizado'); window.rotear();
        } catch (err) { toast(err.message, true); }
      };
    }
  });
}

export async function renderDetalhe(el, id, vivo) {
  const p = prod(id);
  if (!p) { el.innerHTML = vazio('Produto não encontrado.', 'search', `<a class="btn" href="#/produtos">Voltar</a>`); return; }
  const c = cat(p.categoria_id), co = col(p.colecao_id);
  const margem = p.preco - p.custo;
  const porLocal = estPorLocal(p.id);

  el.innerHTML = `
    <div class="page-head"><a class="btn ghost sm" href="#/produtos">${ic('back')}Produtos</a>
      <div class="row">
        <button class="btn sec sm" id="dup">${ic('copy')}Duplicar</button>
        <button class="btn sec sm" id="ed">${ic('edit')}Editar</button>
      </div></div>
    <div class="grid g2 stack-sm" style="align-items:start">
      <div class="card" style="padding:0;overflow:hidden">${fotoHTML(p.foto_url, 'foto-det')}</div>
      <div class="stack">
        <div>
          <h1>${esc(p.nome)}</h1>
          ${p.variacao ? `<div class="muted">${esc(p.variacao)}</div>` : ''}
          <div class="row" style="margin-top:8px">
            ${c ? `<span class="badge" style="background:${esc(c.cor || '#A6C969')}">${esc(c.nome)}</span>` : ''}
            ${co ? `<span class="badge nevoa">${ic('sparkle')}${esc(co.nome)}</span>` : ''}
            ${p.sku ? `<span class="badge nevoa">${esc(p.sku)}</span>` : ''}
            ${!p.ativo ? `<span class="badge erro">inativo</span>` : ''}
            ${estoqueBaixo(p) ? `<span class="badge manteiga">${ic('alert')}estoque baixo</span>` : ''}
          </div>
        </div>
        <div class="grid g3">
          <div class="stat"><div class="lbl">Preço</div><div class="num">${money(p.preco)}</div></div>
          <div class="stat"><div class="lbl">Custo</div><div class="num">${money(p.custo)}</div></div>
          <div class="stat verde"><div class="lbl">Lucro/un.</div><div class="num">${money(margem)}</div><div class="small">${p.preco ? Math.round(margem / p.preco * 100) : 0}% de margem</div></div>
        </div>
        <div class="card">
          <div class="row between"><h3>Estoque por local</h3><span class="num">${num(estTotal(p.id))} un.</span></div>
          <div class="list" style="margin-top:6px">
            ${porLocal.length ? porLocal.map(x => `<div class="li"><span class="grow">${esc(x.local.nome)}</span><b>${num(x.quantidade)}</b></div>`).join('') : '<div class="muted small" style="padding:8px 0">Sem estoque em nenhum local.</div>'}
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn sm" id="ent">${ic('plus')}Dar entrada</button>
            <a class="btn sec sm" href="#/movimentar">${ic('swap')}Transferir / ajustar</a>
          </div>
        </div>
        ${p.observacoes ? `<div class="card"><h3>Observações</h3><p style="margin:6px 0 0;white-space:pre-wrap">${esc(p.observacoes)}</p></div>` : ''}
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Histórico</h3><div id="hist">${'<div class="loading"><div class="spin"></div></div>'}</div></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost sm" id="del" style="color:var(--erro)">${ic('trash')}Excluir produto</button></div>`;

  const st = document.createElement('style');
  st.textContent = '.foto-det{aspect-ratio:1/1;background:var(--nevoa);display:flex;align-items:center;justify-content:center}.foto-det img{width:100%;height:100%;object-fit:cover}.foto-det .icon{width:60px;height:60px;opacity:.3}';
  el.appendChild(st);

  $('#ed', el).onclick = () => formProduto(p);
  $('#dup', el).onclick = () => formProduto(p, { duplicar: true });
  $('#ent', el).onclick = () => entradaRapida(p);
  $('#del', el).onclick = async () => {
    const { count } = await sb.from('venda_itens').select('id', { count: 'exact', head: true }).eq('produto_id', p.id);
    if (count > 0) {
      if (await confirmar(`Esse produto já tem ${count} venda(s) registrada(s). Em vez de excluir (e bagunçar os relatórios), vou só <b>marcar como inativo</b>. Pode ser?`, { ok: 'Marcar inativo' })) {
        await q(sb.from('produtos').update({ ativo: false }).eq('id', p.id)); await recarregarProdutos(); toast('Produto inativado'); window.rotear();
      }
      return;
    }
    if (await confirmar(`Excluir <b>${esc(p.nome)}</b> e todo o histórico de estoque dele? Não dá pra desfazer.`, { ok: 'Excluir', perigo: true })) {
      await q(sb.from('produtos').delete().eq('id', p.id)); await Promise.all([recarregarProdutos(), recarregarEstoque()]);
      toast('Produto excluído'); location.hash = '#/produtos';
    }
  };

  // Histórico de movimentações
  const movs = await q(sb.from('movimentacoes').select('*, vendas(canal, forma_pagamento)').eq('produto_id', p.id).order('criado_em', { ascending: false }).limit(60));
  if (!vivo()) return;
  const tipoNome = { entrada: 'Entrada', transferencia: 'Transferência', venda: 'Venda', ajuste: 'Ajuste', devolucao: 'Devolução' };
  $('#hist', el).innerHTML = movs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Tipo</th><th>Detalhe</th><th class="r">Qtd</th></tr></thead><tbody>
    ${movs.map(m => {
      const o = loc(m.origem_id)?.nome, d = loc(m.destino_id)?.nome;
      const det = m.tipo === 'transferencia' ? `${esc(o || '?')} → ${esc(d || '?')}` : m.tipo === 'venda' ? `${esc(o || canalNome[m.vendas?.canal] || '')}` : esc(d || o || '');
      const sinal = m.tipo === 'transferencia' ? '' : m.destino_id ? '+' : '−';
      return `<tr><td class="small">${dataHoraBR(m.criado_em)}</td><td><span class="badge ${m.tipo === 'venda' ? '' : 'nevoa'}">${tipoNome[m.tipo]}</span></td><td class="small">${det}${m.observacao ? ` <span class="muted">· ${esc(m.observacao)}</span>` : ''}</td><td class="r"><b>${sinal}${m.quantidade}</b></td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="muted small">Nenhuma movimentação ainda.</p>';
}
