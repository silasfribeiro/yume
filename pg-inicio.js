import { S, prod, estTotal, estoqueBaixo, box, est, vendasPeriodo } from './db.js';
import { ic, esc, money, num, vazio, barrasEmpilhadas, $ } from './ui.js';
import { escolherLocalVenda } from './pg-vendas.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export async function render(el, _, vivo) {
  const h = new Date();
  const ini6 = new Date(h.getFullYear(), h.getMonth() - 5, 1);
  const iniMes = new Date(h.getFullYear(), h.getMonth(), 1);
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 1);
  const vendas = await vendasPeriodo(ini6, fim);
  if (!vivo()) return;

  const doMes = vendas.filter(v => new Date(v.data) >= iniMes);
  const itensMes = doMes.flatMap(v => v.venda_itens);
  const fatMes = doMes.reduce((s, v) => s + Number(v.total), 0);
  const unMes = itensMes.reduce((s, i) => s + i.quantidade, 0);
  const lucroMes = fatMes - itensMes.reduce((s, i) => s + i.quantidade * Number(i.custo_unit), 0);

  let valVenda = 0, valCusto = 0, unEst = 0;
  S.produtos.forEach(p => { const t = estTotal(p.id); if (t > 0) { unEst += t; valVenda += t * p.preco; valCusto += t * p.custo; } });
  const baixos = S.produtos.filter(estoqueBaixo);

  const porP = {};
  itensMes.forEach(i => { const r = porP[i.produto_id] ||= { q: 0, v: 0 }; r.q += i.quantidade; r.v += i.quantidade * i.preco_unit; });
  const top = Object.entries(porP).sort((a, b) => b[1].q - a[1].q).slice(0, 5);

  const B = box();
  const boxMes = doMes.filter(v => v.local_id === B?.id);
  const fatBox = boxMes.reduce((s, v) => s + Number(v.total), 0);
  const unBox = B ? S.estoque.filter(e => e.local_id === B.id && e.quantidade > 0).reduce((s, e) => s + e.quantidade, 0) : 0;

  // gráfico 6 meses por canal
  const labels = [], sBox = [], sEv = [], sAt = [];
  for (let i = 0; i < 6; i++) {
    const m = new Date(ini6.getFullYear(), ini6.getMonth() + i, 1);
    labels.push(MESES[m.getMonth()]);
    const vs = vendas.filter(v => { const d = new Date(v.data); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); });
    sBox.push(vs.filter(v => v.canal === 'box').reduce((s, v) => s + Number(v.total), 0));
    sEv.push(vs.filter(v => v.canal === 'evento').reduce((s, v) => s + Number(v.total), 0));
    sAt.push(vs.filter(v => !['box', 'evento'].includes(v.canal)).reduce((s, v) => s + Number(v.total), 0));
  }

  const saud = h.getHours() < 12 ? 'Bom dia' : h.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  el.innerHTML = `
    <div class="page-head"><div><h1>${saud}! 🌿</h1><div class="muted small">Resumo de ${MESES[h.getMonth()]}/${h.getFullYear()}</div></div></div>
    <div class="grid g3" style="margin-bottom:14px">
      <button class="btn" id="nv">${ic('cart')}Nova venda</button>
      <a class="btn sec" href="#/movimentar">${ic('plus')}Entrada / transferência</a>
      <a class="btn sec" href="#/box/contagem">${ic('clipboard')}Contagem do Box</a>
    </div>
    <div class="grid g4">
      <div class="stat verde"><div class="lbl">Faturamento do mês</div><div class="num">${money(fatMes)}</div><div class="small">lucro bruto ${money(lucroMes)}</div></div>
      <div class="stat"><div class="lbl">Itens vendidos no mês</div><div class="num">${num(unMes)}</div><div class="small">${doMes.length} venda(s)</div></div>
      <div class="stat"><div class="lbl">Estoque (preço de venda)</div><div class="num">${money(valVenda)}</div><div class="small">${num(unEst)} unidades</div></div>
      <div class="stat"><div class="lbl">Estoque (custo)</div><div class="num">${money(valCusto)}</div><div class="small">${S.produtos.filter(p => p.ativo).length} produtos ativos</div></div>
    </div>

    <div class="grid g2 stack-sm" style="margin-top:14px;align-items:start">
      <div class="card"><h3>Vendas por canal · 6 meses</h3><div style="margin-top:8px">${barrasEmpilhadas(labels, [
        { nome: 'Box', cor: '#3F4531', valores: sBox }, { nome: 'Eventos', cor: '#A6C969', valores: sEv }, { nome: 'Direta / online', cor: '#FEE398', valores: sAt }])}</div></div>
      <a class="card" href="#/box" style="text-decoration:none;display:block;background:var(--manteiga)">
        <div class="row between"><h3>${ic('store')} ${esc(B?.nome || 'Box')}</h3><span class="small"><b>ver detalhes →</b></span></div>
        <div class="grid g2" style="margin-top:10px">
          <div><div class="small">Vendido no mês</div><div class="num" style="font-size:1.4rem">${money(fatBox)}</div></div>
          <div><div class="small">Unidades no Box</div><div class="num" style="font-size:1.4rem">${num(unBox)}</div></div>
        </div>
      </a>
    </div>

    <div class="grid g2 stack-sm" style="margin-top:14px;align-items:start">
      <div class="card"><h3>${ic('star')} Top 5 do mês</h3>
        ${top.length ? `<div class="list">${top.map(([id, r], i) => { const p = prod(id); return `<a class="li" href="#/produto/${id}" style="text-decoration:none"><b style="width:18px">${i + 1}</b><div class="thumb">${p?.foto_url ? `<img src="${esc(p.foto_url)}">` : ic('image')}</div><div class="grow"><b>${esc(p?.nome || '—')}</b><div class="small muted">${money(r.v)}</div></div><span class="badge">${r.q} un.</span></a>`; }).join('')}</div>` : '<p class="muted small">Nenhuma venda este mês ainda.</p>'}
      </div>
      <div class="card"><h3>${ic('alert')} Estoque baixo</h3>
        ${baixos.length ? `<div class="list">${baixos.slice(0, 8).map(p => `<a class="li" href="#/produto/${p.id}" style="text-decoration:none"><div class="thumb">${p.foto_url ? `<img src="${esc(p.foto_url)}">` : ic('image')}</div><div class="grow"><b>${esc(p.nome)}</b><div class="small muted">mínimo ${p.estoque_minimo}</div></div><span class="badge manteiga">${estTotal(p.id)} un.</span></a>`).join('')}</div>${baixos.length > 8 ? `<p class="small muted">+ ${baixos.length - 8} outros</p>` : ''}`
      : `<p class="muted small">Tudo certo por aqui ✨${S.produtos.length ? '<br>Dica: defina o "estoque mínimo" de cada produto para receber alertas.' : ''}</p>`}
      </div>
    </div>
    ${!S.produtos.length ? `<div class="card" style="margin-top:14px">${vazio('Comece cadastrando os produtos 🌿', 'leaf', '<a class="btn" href="#/produtos">Ir para Produtos</a>')}</div>` : ''}`;
  $('#nv', el).onclick = escolherLocalVenda;
}
