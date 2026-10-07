import { sb, S, q, todos, cat, col, prod, est, box, atelie, vendasPeriodo, salvarConfig, confNum, recarregarEstoque, pagNome } from './db.js';
import { ic, esc, money, num, toast, modal, vazio, loading, parseNum, diaISO, qtyHTML, bindQty, dataBR, $ } from './ui.js';
import { seletorPeriodo, periodo } from './pg-vendas.js';
import { abrirTransferencia } from './pg-movimentar.js';

const estado = { per: 'mes', ini: diaISO(new Date(Date.now() - 29 * 864e5)), fim: diaISO() };

function configBox(onSave) {
  modal(`<div class="mh"><h2>Custos do Box</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <form id="fc">
      <div class="field"><label class="f">Aluguel mensal (R$)</label><input class="in" name="al" inputmode="decimal" value="${String(confNum('box_aluguel')).replace('.', ',')}"></div>
      <div class="field"><label class="f">Comissão sobre vendas (%)</label><input class="in" name="co" inputmode="decimal" value="${String(confNum('box_comissao_pct')).replace('.', ',')}"></div>
      <div class="field"><label class="f">Considerar "encalhado" depois de quantos dias sem vender?</label><input class="in" name="dias" type="number" min="1" value="${confNum('encalhado_dias', 30)}"></div>
      <button class="btn full">${ic('check')}Salvar</button></form>`, {
    onMount: (m, close) => $('#fc', m).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try {
        await salvarConfig('box_aluguel', parseNum(f.get('al')));
        await salvarConfig('box_comissao_pct', parseNum(f.get('co')));
        await salvarConfig('encalhado_dias', Number(f.get('dias')) || 30);
        close(); toast('Salvo'); onSave();
      } catch (err) { toast(err.message, true); }
    }
  });
}

export async function render(el, _, vivo) {
  const B = box(), A = atelie();
  if (!B) { el.innerHTML = vazio('Nenhum local do tipo Box cadastrado.', 'store', `<a class="btn" href="#/config">Configurações</a>`); return; }

  el.innerHTML = `
    <div class="page-head"><div><h1>${esc(B.nome)}</h1><div class="small muted">O que vende e o que não vende no Box</div></div>
      <button class="btn ghost sm" id="cfg">${ic('sliders')}Custos</button></div>
    <div class="grid g3" style="margin-bottom:14px">
      <a class="btn" href="#/box/contagem">${ic('clipboard')}Contagem do Box</a>
      <a class="btn sec" href="#/caixa/${B.id}">${ic('cart')}Venda avulsa</a>
      <button class="btn sec" id="repor">${ic('swap')}Levar itens pro Box</button>
    </div>
    <div id="per"></div>
    <div id="res">${loading()}</div>`;

  const carregar = async () => {
    $('#res', el).innerHTML = loading();
    const [a, b] = periodo(estado.per, estado.ini, estado.fim);
    const [vendas, chegadas, saidasVenda] = await Promise.all([
      vendasPeriodo(a, b, x => x.eq('local_id', B.id)),
      todos(() => sb.from('movimentacoes').select('produto_id, criado_em').eq('destino_id', B.id).order('criado_em')),
      todos(() => sb.from('movimentacoes').select('produto_id, criado_em').eq('origem_id', B.id).eq('tipo', 'venda').order('criado_em')),
    ]);
    if (!vivo()) return;

    // --- números do período
    const itens = vendas.flatMap(v => v.venda_itens);
    const fat = vendas.reduce((s, v) => s + Number(v.total), 0);
    const custoProd = itens.reduce((s, i) => s + i.quantidade * Number(i.custo_unit), 0);
    const dias = Math.max(1, Math.round((b - a) / 864e5));
    const meses = Math.max(1, Math.round(dias / 30));
    const aluguel = confNum('box_aluguel') * meses;
    const comissao = fat * confNum('box_comissao_pct') / 100;
    const liquido = fat - custoProd - aluguel - comissao;
    const noBox = S.estoque.filter(e => e.local_id === B.id && e.quantidade > 0);
    const unBox = noBox.reduce((s, e) => s + e.quantidade, 0);
    const valBox = noBox.reduce((s, e) => s + e.quantidade * (prod(e.produto_id)?.preco || 0), 0);

    // --- por produto
    const porP = {};
    itens.forEach(i => { const r = porP[i.produto_id] ||= { q: 0, v: 0 }; r.q += i.quantidade; r.v += i.quantidade * i.preco_unit; });
    const ids = new Set([...Object.keys(porP), ...noBox.map(e => e.produto_id)]);
    const linhas = [...ids].map(id => {
      const p = prod(id); const v = porP[id] || { q: 0, v: 0 }; const e = est(id, B.id);
      return { id, p, vend: v.q, fat: v.v, estoque: e, giro: (v.q + e) ? v.q / (v.q + e) : 0 };
    }).filter(l => l.p).sort((x, y) => y.vend - x.vend || y.fat - x.fat);

    // --- campeões: mais vendidos com estoque baixo no Box
    const campeoes = linhas.filter(l => l.vend > 0).slice(0, 8);
    const precisaRepor = campeoes.filter(l => l.estoque <= Math.max(2, Math.ceil(l.vend / 2)));

    // --- encalhados
    const limite = confNum('encalhado_dias', 30);
    const ultimaVenda = {}, primeiraChegada = {};
    saidasVenda.forEach(m => ultimaVenda[m.produto_id] = m.criado_em);
    chegadas.forEach(m => { if (!primeiraChegada[m.produto_id]) primeiraChegada[m.produto_id] = m.criado_em; });
    const agora = Date.now();
    const encalhados = noBox.map(e => {
      const ref = ultimaVenda[e.produto_id] || primeiraChegada[e.produto_id];
      const d = ref ? Math.floor((agora - new Date(ref)) / 864e5) : 0;
      return { id: e.produto_id, p: prod(e.produto_id), q: e.quantidade, dias: d, nunca: !ultimaVenda[e.produto_id] };
    }).filter(x => x.p && x.dias >= limite).sort((x, y) => y.dias - x.dias);

    // --- por categoria / coleção
    const agrupar = (fn) => {
      const g = {};
      itens.forEach(i => { const k = fn(prod(i.produto_id)) || 'Sem'; const r = g[k] ||= { q: 0, v: 0 }; r.q += i.quantidade; r.v += i.quantidade * i.preco_unit; });
      return Object.entries(g).sort((a, b) => b[1].v - a[1].v);
    };
    const porCat = agrupar(p => cat(p?.categoria_id)?.nome || 'Sem categoria');
    const porCol = agrupar(p => col(p?.colecao_id)?.nome || 'Sem coleção');
    const barras = (g) => { const mx = Math.max(1, ...g.map(x => x[1].v)); return g.length ? g.map(([k, r]) => `<div style="margin:8px 0"><div class="row between small"><b>${esc(k)}</b><span>${r.q} un. · ${money(r.v)}</span></div><div class="bar-h"><span style="width:${r.v / mx * 100}%"></span></div></div>`).join('') : '<p class="muted small">Sem vendas no período.</p>'; };

    $('#res', el).innerHTML = `
      <div class="grid g4">
        <div class="stat verde"><div class="lbl">Faturamento</div><div class="num">${money(fat)}</div><div class="small">${num(itens.reduce((s, i) => s + i.quantidade, 0))} un. vendidas</div></div>
        <div class="stat ${liquido >= 0 ? '' : 'destaque'}"><div class="lbl">Lucro líquido</div><div class="num">${money(liquido)}</div><div class="small">já descontando custos</div></div>
        <div class="stat"><div class="lbl">Custo do Box</div><div class="num">${money(aluguel + comissao)}</div><div class="small">${aluguel ? `aluguel ${money(aluguel)}` : ''}${aluguel && comissao ? ' + ' : ''}${comissao ? `comissão ${money(comissao)}` : ''}${!aluguel && !comissao ? '<a href="javascript:void 0" id="cfg2">configurar</a>' : ''}</div></div>
        <div class="stat"><div class="lbl">No Box agora</div><div class="num">${num(unBox)} un.</div><div class="small">${money(valBox)} em produtos</div></div>
      </div>

      <div class="grid g2 stack-sm" style="margin-top:14px;align-items:start">
        <div class="card">
          <div class="row between"><h3>${ic('star')} Campeões</h3>${precisaRepor.length ? `<button class="btn sm folha" id="reporC">Repor ${precisaRepor.length}</button>` : ''}</div>
          ${campeoes.length ? `<div class="list">${campeoes.map(l => `<a class="li" href="#/produto/${l.id}" style="text-decoration:none"><div class="thumb">${l.p.foto_url ? `<img src="${esc(l.p.foto_url)}">` : ic('image')}</div>
            <div class="grow"><b>${esc(l.p.nome)}</b><div class="small muted">${l.vend} vendidos · ${l.estoque} no Box</div></div>
            ${precisaRepor.includes(l) ? '<span class="badge manteiga">repor</span>' : ''}</a>`).join('')}</div>` : '<p class="muted small">Ainda sem vendas nesse período.</p>'}
        </div>
        <div class="card">
          <div class="row between"><h3>${ic('clock')} Encalhados</h3>${encalhados.length ? `<button class="btn sm sec" id="voltarE">Trazer de volta</button>` : ''}</div>
          <p class="small muted" style="margin:4px 0 0">No Box há ${limite}+ dias sem vender</p>
          ${encalhados.length ? `<div class="list">${encalhados.map(x => `<a class="li" href="#/produto/${x.id}" style="text-decoration:none"><div class="thumb">${x.p.foto_url ? `<img src="${esc(x.p.foto_url)}">` : ic('image')}</div>
            <div class="grow"><b>${esc(x.p.nome)}</b><div class="small muted">${x.q} no Box · ${x.nunca ? 'nunca vendeu' : 'última venda'} há ${x.dias} dias</div></div></a>`).join('')}</div>` : vazio('Nada encalhado 🎉', 'leaf')}
        </div>
      </div>

      <div class="grid g2 stack-sm" style="margin-top:14px;align-items:start">
        <div class="card"><h3>Por categoria</h3>${barras(porCat)}</div>
        <div class="card"><h3>Por coleção</h3>${barras(porCol)}</div>
      </div>

      <div class="card" style="margin-top:14px"><h3>Produto a produto</h3>
        <p class="small muted" style="margin:4px 0 8px">Giro = vendidos ÷ (vendidos + o que ainda está no Box). Quanto mais perto de 100%, melhor.</p>
        ${linhas.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Produto</th><th class="r">Vendidos</th><th class="r">Faturamento</th><th class="r">No Box</th><th class="r">Giro</th></tr></thead><tbody>
          ${linhas.map(l => `<tr><td><a href="#/produto/${l.id}">${esc(l.p.nome)}</a></td><td class="r">${l.vend}</td><td class="r">${money(l.fat)}</td><td class="r">${l.estoque}</td><td class="r"><span class="badge ${l.giro >= .5 ? '' : l.giro > 0 ? 'manteiga' : 'nevoa'}">${Math.round(l.giro * 100)}%</span></td></tr>`).join('')}
        </tbody></table></div>` : vazio('Nenhum produto no Box ainda.', 'store', `<button class="btn" id="repor2">Levar itens pro Box</button>`)}
      </div>`;

    const r2 = $('#repor2', el); if (r2) r2.onclick = () => abrirTransferencia(A?.id, B.id);
    const c2 = $('#cfg2', el); if (c2) c2.onclick = () => configBox(carregar);
    const rc = $('#reporC', el); if (rc) rc.onclick = () => {
      const itensT = {};
      precisaRepor.forEach(l => { const sug = Math.min(est(l.id, A?.id), Math.max(1, l.vend - l.estoque)); if (sug > 0) itensT[l.id] = sug; });
      if (!Object.keys(itensT).length) { toast('Não tem estoque desses no estoque principal para repor', true); return; }
      abrirTransferencia(A?.id, B.id, itensT);
    };
    const ve = $('#voltarE', el); if (ve) ve.onclick = () => abrirTransferencia(B.id, A?.id, Object.fromEntries(encalhados.map(x => [x.id, x.q])));
  };

  $('#cfg', el).onclick = () => configBox(carregar);
  $('#repor', el).onclick = () => abrirTransferencia(A?.id, B.id);
  const sp = seletorPeriodo(estado, carregar);
  $('#per', el).innerHTML = sp.html; sp.bind($('#per', el));
  await carregar();
}

// ---------- Contagem do Box ----------
export async function renderContagem(el, _, vivo) {
  const B = box();
  if (!B) { location.hash = '#/box'; return; }
  const ultima = await q(sb.from('contagens').select('*').eq('local_id', B.id).order('criado_em', { ascending: false }).limit(1));
  if (!vivo()) return;
  const itens = S.estoque.filter(e => e.local_id === B.id && e.quantidade > 0).map(e => ({ p: prod(e.produto_id), esperado: e.quantidade })).filter(x => x.p).sort((a, b) => a.p.nome.localeCompare(b.p.nome));
  const contado = Object.fromEntries(itens.map(x => [x.p.id, x.esperado]));

  el.innerHTML = `
    <div class="page-head"><a class="btn ghost sm" href="#/box">${ic('back')}Box</a></div>
    <h1>Contagem do Box</h1>
    <p class="muted" style="margin-top:4px">Conte o que está <b>fisicamente no Box agora</b> e ajuste os números. O app calcula o que foi vendido desde a última contagem.${ultima[0] ? `<br><span class="small">Última contagem: ${dataBR(ultima[0].criado_em)} (${ultima[0].itens_vendidos} itens · ${money(ultima[0].total)})</span>` : ''}</p>
    <div class="card" id="lista">${itens.length ? `<div class="list">${itens.map(x => `
      <div class="li"><div class="thumb">${x.p.foto_url ? `<img src="${esc(x.p.foto_url)}" loading="lazy">` : ic('image')}</div>
        <div class="grow"><b>${esc(x.p.nome)}</b><div class="small muted">Esperado: ${x.esperado} · <span data-dif="${x.p.id}"></span></div></div>
        ${qtyHTML(x.p.id, x.esperado, 0)}</div>`).join('')}</div>` : vazio('Não há produtos no Box para contar.', 'store', `<a class="btn" href="#/movimentar">Levar itens pro Box</a>`)}</div>
    <div style="height:80px"></div>`;
  if (!itens.length) return;

  const barra = document.createElement('div'); barra.className = 'cart-bar'; document.body.appendChild(barra);
  const resumo = () => {
    let un = 0, val = 0, sobras = 0;
    itens.forEach(x => { const d = x.esperado - contado[x.p.id]; if (d > 0) { un += d; val += d * x.p.preco; } else if (d < 0) sobras += -d; });
    return { un, val, sobras };
  };
  const atualizar = () => {
    itens.forEach(x => {
      const d = x.esperado - contado[x.p.id]; const s = $(`[data-dif="${x.p.id}"]`, el);
      s.innerHTML = d > 0 ? `<b style="color:var(--oliva)">vendeu ${d}</b>` : d < 0 ? `<b style="color:var(--erro)">${-d} a mais que o esperado</b>` : 'sem vendas';
    });
    const r = resumo();
    barra.innerHTML = `<div class="grow"><div class="num">${r.un} vendido(s)</div><div class="small">${money(r.val)}</div></div><button class="btn folha" id="conf">${ic('check')}Confirmar contagem</button>`;
    $('#conf', barra).onclick = confirmarContagem;
  };
  bindQty($('#lista', el), inp => { contado[inp.name] = Math.max(0, Number(inp.value) || 0); atualizar(); });

  const confirmarContagem = () => {
    const r = resumo();
    let pag = 'outro';
    modal(`<div class="mh"><h2>Confirmar contagem</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
      <p><b>${r.un}</b> item(ns) vendidos no Box, totalizando <b>${money(r.val)}</b>.</p>
      ${r.sobras ? `<p class="small" style="background:var(--manteiga);padding:8px 12px;border-radius:12px">Tem ${r.sobras} item(ns) <b>a mais</b> do que o esperado. Vou registrar como ajuste de estoque.</p>` : ''}
      ${r.un ? `<label class="f">Como esse valor foi/será recebido?</label>
      <div class="chips field" id="pags">${Object.entries(pagNome).map(([k, n]) => `<button type="button" class="chip ${k === pag ? 'on' : ''}" data-p="${k}">${n === 'Outro' ? 'Repasse do Box' : n}</button>`).join('')}</div>` : ''}
      <button class="btn full" id="ok">${ic('check')}Registrar</button>`, {
      onMount: (m, close) => {
        const pg = $('#pags', m); if (pg) pg.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pag = b.dataset.p; pg.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); };
        $('#ok', m).onclick = async () => {
          const b = $('#ok', m); b.disabled = true; b.textContent = 'Registrando...';
          try {
            let vendaId = null;
            const vendidos = itens.filter(x => x.esperado - contado[x.p.id] > 0);
            if (vendidos.length) {
              vendaId = await q(sb.rpc('registrar_venda', { p: { local_id: B.id, canal: 'box', forma_pagamento: pag, origem: 'contagem', observacao: 'Contagem do Box',
                itens: vendidos.map(x => ({ produto_id: x.p.id, quantidade: x.esperado - contado[x.p.id], preco_unit: x.p.preco })) } }));
            }
            const mais = itens.filter(x => contado[x.p.id] - x.esperado > 0);
            if (mais.length) await q(sb.rpc('registrar_movimentos', { p: { tipo: 'ajuste', destino_id: B.id, observacao: 'Contagem do Box (sobra)', itens: mais.map(x => ({ produto_id: x.p.id, quantidade: contado[x.p.id] - x.esperado })) } }));
            await q(sb.from('contagens').insert({ local_id: B.id, venda_id: vendaId, itens_vendidos: r.un, total: r.val }));
            await recarregarEstoque();
            close(); toast('Contagem registrada! ✨'); location.hash = '#/box';
          } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Registrar'; }
        };
      }
    });
  };
  atualizar();
}
