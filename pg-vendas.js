import { sb, S, q, loc, prod, cat, vendasPeriodo, canalNome, pagNome, recarregarEstoque, locaisFixos } from './db.js';
import { ic, esc, money, num, toast, modal, confirmar, vazio, dataHoraBR, diaISO, baixarArquivo, csv, loading, $ } from './ui.js';

export function periodo(chave, ini, fim) {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const amanha = new Date(h); amanha.setDate(h.getDate() + 1);
  switch (chave) {
    case 'hoje': return [h, amanha];
    case '7d': { const a = new Date(h); a.setDate(h.getDate() - 6); return [a, amanha]; }
    case '30d': { const a = new Date(h); a.setDate(h.getDate() - 29); return [a, amanha]; }
    case 'mes': return [new Date(h.getFullYear(), h.getMonth(), 1), amanha];
    case 'mespassado': return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 1)];
    case 'ano': return [new Date(h.getFullYear(), 0, 1), amanha];
    case 'custom': { const a = new Date(ini + 'T00:00'); const b = new Date(fim + 'T00:00'); b.setDate(b.getDate() + 1); return [a, b]; }
  }
  return [new Date(h.getFullYear(), h.getMonth(), 1), amanha];
}
export const periodoNomes = { hoje: 'Hoje', '7d': '7 dias', '30d': '30 dias', mes: 'Este mês', mespassado: 'Mês passado', ano: 'Este ano', custom: 'Escolher datas' };

export function seletorPeriodo(estado, onChange) {
  const html = `<div class="row field" style="align-items:flex-end">
    <div><label class="f">Período</label><select class="in" data-per style="min-width:150px">${Object.entries(periodoNomes).map(([k, n]) => `<option value="${k}" ${estado.per === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div data-custom class="row ${estado.per === 'custom' ? '' : 'hidden'}">
      <div><label class="f">De</label><input class="in" type="date" data-ini value="${estado.ini}"></div>
      <div><label class="f">Até</label><input class="in" type="date" data-fim value="${estado.fim}"></div>
    </div></div>`;
  const bind = (root) => {
    const s = root.querySelector('[data-per]'), c = root.querySelector('[data-custom]');
    s.onchange = () => { estado.per = s.value; c.classList.toggle('hidden', s.value !== 'custom'); onChange(); };
    root.querySelector('[data-ini]').onchange = e => { estado.ini = e.target.value; onChange(); };
    root.querySelector('[data-fim]').onchange = e => { estado.fim = e.target.value; onChange(); };
  };
  return { html, bind };
}

const estado = { per: 'mes', ini: diaISO(new Date(Date.now() - 6 * 864e5)), fim: diaISO(), canal: '', pag: '' };

export function escolherLocalVenda() {
  const ls = S.locais.filter(l => l.ativo !== false);
  modal(`<div class="mh"><h2>Nova venda: onde?</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <div class="list">${ls.map(l => `<a class="li" href="#/caixa/${l.id}" data-close style="text-decoration:none">${ic(l.tipo === 'box' ? 'store' : l.tipo === 'evento' ? 'calendar' : 'home')}<b class="grow">${esc(l.nome)}</b>${ic('cart')}</a>`).join('')}</div>`);
}

export async function render(el, _, vivo) {
  el.innerHTML = `
    <div class="page-head"><h1>Vendas</h1>
      <div class="row"><button class="btn sec sm" id="exp">${ic('download')}CSV</button><button class="btn sm" id="nova">${ic('plus')}Nova venda</button></div></div>
    <div id="per"></div>
    <div class="row field">
      <select class="in" id="fcanal" style="max-width:200px"><option value="">Todos os canais</option>${Object.entries(canalNome).map(([k, n]) => `<option value="${k}" ${estado.canal === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select class="in" id="fpag" style="max-width:200px"><option value="">Todas as formas</option>${Object.entries(pagNome).map(([k, n]) => `<option value="${k}" ${estado.pag === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div id="res">${loading()}</div>`;
  let vendas = [];

  const carregar = async () => {
    $('#res', el).innerHTML = loading();
    const [a, b] = periodo(estado.per, estado.ini, estado.fim);
    vendas = await vendasPeriodo(a, b, x => {
      if (estado.canal) x = x.eq('canal', estado.canal);
      if (estado.pag) x = x.eq('forma_pagamento', estado.pag);
      return x;
    });
    if (!vivo()) return;
    desenhar();
  };

  const desenhar = () => {
    const total = vendas.reduce((s, v) => s + Number(v.total), 0);
    const itens = vendas.flatMap(v => v.venda_itens);
    const un = itens.reduce((s, i) => s + i.quantidade, 0);
    const custo = itens.reduce((s, i) => s + i.quantidade * Number(i.custo_unit), 0);
    const porPag = {};
    vendas.forEach(v => porPag[v.forma_pagamento] = (porPag[v.forma_pagamento] || 0) + Number(v.total));
    $('#res', el).innerHTML = `
      <div class="grid g4">
        <div class="stat verde"><div class="lbl">Faturamento</div><div class="num">${money(total)}</div></div>
        <div class="stat"><div class="lbl">Lucro bruto</div><div class="num">${money(total - custo)}</div></div>
        <div class="stat"><div class="lbl">Vendas · itens</div><div class="num">${vendas.length} · ${num(un)}</div></div>
        <div class="stat"><div class="lbl">Ticket médio</div><div class="num">${money(vendas.length ? total / vendas.length : 0)}</div></div>
      </div>
      ${Object.keys(porPag).length ? `<div class="row" style="margin:12px 0">${Object.entries(porPag).map(([k, v]) => `<span class="badge nevoa">${pagNome[k] || k}: ${money(v)}</span>`).join('')}</div>` : ''}
      <div class="card" style="margin-top:12px">
        ${vendas.length ? `<div class="list">${vendas.map(v => {
          const qtd = v.venda_itens.reduce((s, i) => s + i.quantidade, 0);
          return `<div class="li" data-v="${v.id}" style="cursor:pointer">
            <div class="grow"><div class="row" style="gap:6px"><b>${money(v.total)}</b><span class="badge ${v.canal === 'box' ? 'oliva' : v.canal === 'evento' ? '' : 'manteiga'}">${esc(loc(v.local_id)?.nome || canalNome[v.canal])}${v.canal === 'online' ? ' · online' : ''}</span>${v.origem === 'contagem' ? '<span class="badge nevoa">contagem</span>' : ''}</div>
            <div class="small muted">${dataHoraBR(v.data)} · ${qtd} item(ns) · ${pagNome[v.forma_pagamento] || v.forma_pagamento || ''}</div></div>${ic('receipt')}</div>`;
        }).join('')}</div>` : vazio('Nenhuma venda nesse período.', 'receipt')}
      </div>`;
    $('#res', el).querySelectorAll('[data-v]').forEach(li => li.onclick = () => detalhe(vendas.find(v => v.id === li.dataset.v)));
  };

  const detalhe = (v) => {
    modal(`<div class="mh"><h2>Venda</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
      <p class="muted" style="margin-top:0">${dataHoraBR(v.data)} · ${esc(loc(v.local_id)?.nome || canalNome[v.canal])} · ${pagNome[v.forma_pagamento] || ''}</p>
      <table class="t"><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Preço</th><th class="r">Subtotal</th></tr></thead><tbody>
      ${v.venda_itens.map(i => `<tr><td>${esc(prod(i.produto_id)?.nome || '(produto excluído)')}</td><td class="r">${i.quantidade}</td><td class="r">${money(i.preco_unit)}</td><td class="r">${money(i.quantidade * i.preco_unit)}</td></tr>`).join('')}
      </tbody></table>
      ${Number(v.desconto) ? `<p class="r" style="text-align:right">Desconto: −${money(v.desconto)}</p>` : ''}
      <div class="row between" style="margin:12px 0"><span class="muted">Total</span><span class="num" style="font-size:1.4rem">${money(v.total)}</span></div>
      ${v.observacao ? `<p class="small">${esc(v.observacao)}</p>` : ''}
      <button class="btn ghost sm" id="del" style="color:var(--erro)">${ic('trash')}Excluir venda (devolve os itens ao estoque)</button>`, {
      onMount: (m, close) => {
        $('#del', m).onclick = async () => {
          if (!(await confirmar('Excluir esta venda? Os itens voltam para o estoque do local.', { ok: 'Excluir', perigo: true }))) return;
          try { await q(sb.from('vendas').delete().eq('id', v.id)); await recarregarEstoque(); close(); toast('Venda excluída'); carregar(); }
          catch (e) { toast(e.message, true); }
        };
      }
    });
  };

  const sp = seletorPeriodo(estado, carregar);
  $('#per', el).innerHTML = sp.html; sp.bind($('#per', el));
  $('#fcanal', el).onchange = e => { estado.canal = e.target.value; carregar(); };
  $('#fpag', el).onchange = e => { estado.pag = e.target.value; carregar(); };
  $('#nova', el).onclick = escolherLocalVenda;
  $('#exp', el).onclick = () => {
    const linhas = [['Data', 'Local', 'Canal', 'Pagamento', 'Produto', 'Categoria', 'Qtd', 'Preço unit.', 'Subtotal', 'Custo unit.', 'Desconto da venda', 'Total da venda', 'Origem']];
    vendas.forEach(v => v.venda_itens.forEach(i => {
      const p = prod(i.produto_id);
      linhas.push([dataHoraBR(v.data), loc(v.local_id)?.nome, canalNome[v.canal], pagNome[v.forma_pagamento], p?.nome, cat(p?.categoria_id)?.nome, i.quantidade,
        String(i.preco_unit).replace('.', ','), (i.quantidade * i.preco_unit).toFixed(2).replace('.', ','), String(i.custo_unit).replace('.', ','),
        String(v.desconto).replace('.', ','), String(v.total).replace('.', ','), v.origem]);
    }));
    baixarArquivo(`vendas-yume-${diaISO()}.csv`, csv(linhas));
  };
  await carregar();
}
