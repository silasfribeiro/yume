// Relatório completo em Excel (.xlsx), gerado no próprio aparelho
import { sb, S, todos, cat, col, loc, prod, est, estTotal, box, confNum, canalNome, pagNome } from './db.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const BRL = '"R$" #,##0.00';
const PCT = '0%';

function carregarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Não consegui carregar o gerador de planilhas. Verifique a internet.'));
    document.head.appendChild(s);
  });
}

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '';
const mesChave = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const mesNome = k => { const [a, m] = k.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1]}/${a}`; };

// Monta uma aba a partir de linhas; formata colunas de dinheiro/porcentagem e larguras
function aba(XLSX, linhas, { dinheiro = [], pct = [], larguras = [] } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || cell.t !== 'n') continue;
      if (dinheiro.includes(C)) cell.z = BRL;
      if (pct.includes(C)) cell.z = PCT;
    }
  }
  ws['!cols'] = (linhas[0] || []).map((_, i) => ({ wch: larguras[i] || Math.min(40, Math.max(10, ...linhas.slice(0, 200).map(l => String(l[i] ?? '').length + 2))) }));
  return ws;
}

export async function gerarRelatorio() {
  const XLSX = await carregarXLSX();
  const [vendas, movs, eventos] = await Promise.all([
    todos(() => sb.from('vendas').select('*, venda_itens(*)').order('data')),
    todos(() => sb.from('movimentacoes').select('produto_id, tipo, origem_id, destino_id, criado_em').order('criado_em')),
    todos(() => sb.from('eventos').select('*').order('data_inicio')),
  ]);
  const hoje = new Date();
  const B = box();
  const wb = XLSX.utils.book_new();
  const itens = vendas.flatMap(v => v.venda_itens.map(i => ({ ...i, v })));
  const lucroItem = i => i.quantidade * (Number(i.preco_unit) - Number(i.custo_unit));
  const somaFat = vs => vs.reduce((s, v) => s + Number(v.total), 0);
  const ativos = S.produtos.filter(p => p.ativo);
  const locaisEst = S.locais.filter(l => l.tipo !== 'evento' || S.estoque.some(e => e.local_id === l.id && e.quantidade > 0));

  // ---------- Resumo ----------
  let unEst = 0, valVenda = 0, valCusto = 0;
  S.produtos.forEach(p => { const t = estTotal(p.id); if (t > 0) { unEst += t; valVenda += t * p.preco; valCusto += t * p.custo; } });
  const iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1), iniAno = new Date(hoje.getFullYear(), 0, 1);
  const vMes = vendas.filter(v => new Date(v.data) >= iniMes), vAno = vendas.filter(v => new Date(v.data) >= iniAno);
  const lucro = vs => vs.flatMap(v => v.venda_itens).reduce((s, i) => s + lucroItem(i), 0) - vs.reduce((s, v) => s + Number(v.desconto || 0), 0);
  const unid = vs => vs.flatMap(v => v.venda_itens).reduce((s, i) => s + i.quantidade, 0);
  const baixos = ativos.filter(p => p.estoque_minimo > 0 && estTotal(p.id) <= p.estoque_minimo);
  const canais = ['atelie', 'online', 'box', 'evento', 'outro'];
  const custoMesas = eventos.reduce((s, e) => s + Number(e.custo_mesa || 0), 0);

  const resumo = [
    ['Relatório Yume', ''],
    ['Gerado em', hoje.toLocaleString('pt-BR')],
    [],
    ['ESTOQUE', ''],
    ['Produtos ativos', ativos.length],
    ['Produtos cadastrados (com inativos)', S.produtos.length],
    ['Unidades em estoque (todos os locais)', unEst],
    ['Valor do estoque (preço de venda)', r2(valVenda)],
    ['Valor do estoque (custo)', r2(valCusto)],
    ['Produtos com estoque baixo', baixos.length],
    ...locaisEst.filter(l => l.ativo !== false).map(l => [`Unidades em: ${l.nome}`, S.estoque.filter(e => e.local_id === l.id && e.quantidade > 0).reduce((s, e) => s + e.quantidade, 0)]),
    [],
    ['VENDAS', ''],
    ['Faturamento no mês', r2(somaFat(vMes))],
    ['Lucro bruto no mês', r2(lucro(vMes))],
    ['Unidades vendidas no mês', unid(vMes)],
    ['Faturamento no ano', r2(somaFat(vAno))],
    ['Lucro bruto no ano', r2(lucro(vAno))],
    ['Faturamento total (desde o início)', r2(somaFat(vendas))],
    ['Lucro bruto total', r2(lucro(vendas))],
    ['Número de vendas', vendas.length],
    ['Ticket médio', vendas.length ? r2(somaFat(vendas) / vendas.length) : 0],
    [],
    ['POR CANAL (total)', ''],
    ...canais.map(c => [canalNome[c], r2(somaFat(vendas.filter(v => v.canal === c)))]).filter(l => l[1] > 0),
    [],
    ['EVENTOS', ''],
    ['Eventos cadastrados', eventos.length],
    ['Faturamento em eventos', r2(somaFat(vendas.filter(v => v.canal === 'evento')))],
    ['Custo total de mesas', r2(custoMesas)],
    [],
    ['BOX', ''],
    ['Faturamento no Box (total)', r2(somaFat(vendas.filter(v => v.canal === 'box')))],
    ['Faturamento no Box (mês)', r2(somaFat(vMes.filter(v => v.canal === 'box')))],
    ['Aluguel mensal configurado', confNum('box_aluguel')],
    ['Comissão configurada (%)', confNum('box_comissao_pct')],
  ];
  const linhasDinheiro = new Set(['Valor do estoque (preço de venda)', 'Valor do estoque (custo)', 'Faturamento no mês', 'Lucro bruto no mês', 'Faturamento no ano', 'Lucro bruto no ano', 'Faturamento total (desde o início)', 'Lucro bruto total', 'Ticket médio', 'Faturamento em eventos', 'Custo total de mesas', 'Faturamento no Box (total)', 'Faturamento no Box (mês)', 'Aluguel mensal configurado', ...canais.map(c => canalNome[c])]);
  const wsResumo = aba(XLSX, resumo, { larguras: [40, 22] });
  resumo.forEach((l, R) => { if (linhasDinheiro.has(l[0])) { const c = wsResumo[XLSX.utils.encode_cell({ r: R, c: 1 })]; if (c && c.t === 'n') c.z = BRL; } });
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // ---------- Estoque ----------
  const locsFixos = S.locais.filter(l => l.tipo !== 'evento');
  const estHead = ['Produto', 'Variação', 'Código', 'Categoria', 'Coleção', 'Preço', 'Custo', 'Lucro/un.', ...locsFixos.map(l => l.nome), 'Total', 'Mínimo', 'Situação', 'Valor (venda)', 'Valor (custo)', 'Ativo'];
  const estLinhas = [estHead, ...S.produtos.map(p => {
    const t = estTotal(p.id);
    const sit = !p.ativo ? 'inativo' : t <= 0 ? 'ESGOTADO' : (p.estoque_minimo > 0 && t <= p.estoque_minimo) ? 'estoque baixo' : 'ok';
    return [p.nome, p.variacao || '', p.sku || '', cat(p.categoria_id)?.nome || '', col(p.colecao_id)?.nome || '', r2(p.preco), r2(p.custo), r2(p.preco - p.custo),
      ...locsFixos.map(l => est(p.id, l.id)), t, p.estoque_minimo || 0, sit, r2(t * p.preco), r2(t * p.custo), p.ativo ? 'sim' : 'não'];
  })];
  const nL = locsFixos.length;
  XLSX.utils.book_append_sheet(wb, aba(XLSX, estLinhas, { dinheiro: [5, 6, 7, 11 + nL, 12 + nL] }), 'Estoque');

  // ---------- Vendas por produto ----------
  const porP = {};
  itens.forEach(i => {
    const r = porP[i.produto_id] ||= { q: 0, fat: 0, luc: 0, canal: {} };
    r.q += i.quantidade; r.fat += i.quantidade * i.preco_unit; r.luc += lucroItem(i);
    r.canal[i.v.canal] = (r.canal[i.v.canal] || 0) + i.quantidade;
  });
  const ppHead = ['Produto', 'Categoria', 'Coleção', 'Unid. vendidas', 'Faturamento', 'Lucro bruto', ...canais.map(c => `Vendidos - ${canalNome[c]}`), 'Em estoque'];
  const ppLinhas = [ppHead, ...Object.entries(porP).sort((a, b) => b[1].q - a[1].q).map(([id, r]) => {
    const p = prod(id);
    return [p?.nome || '(excluído)', cat(p?.categoria_id)?.nome || '', col(p?.colecao_id)?.nome || '', r.q, r2(r.fat), r2(r.luc), ...canais.map(c => r.canal[c] || 0), p ? estTotal(p.id) : 0];
  })];
  XLSX.utils.book_append_sheet(wb, aba(XLSX, ppLinhas, { dinheiro: [4, 5] }), 'Vendas por produto');

  // ---------- Vendas por mês e canal ----------
  const meses = [...new Set(vendas.map(v => mesChave(v.data)))].sort();
  const mesLinhas = [['Mês', ...canais.map(c => canalNome[c]), 'Total', 'Lucro bruto', 'Nº vendas', 'Unidades'],
    ...meses.map(m => {
      const vs = vendas.filter(v => mesChave(v.data) === m);
      return [mesNome(m), ...canais.map(c => r2(somaFat(vs.filter(v => v.canal === c)))), r2(somaFat(vs)), r2(lucro(vs)), vs.length, unid(vs)];
    })];
  XLSX.utils.book_append_sheet(wb, aba(XLSX, mesLinhas, { dinheiro: [1, 2, 3, 4, 5, 6, 7] }), 'Vendas por mês');

  // ---------- Venda direta e loja online ----------
  const vdHead = ['Data', 'Canal', 'Pagamento', 'Produto', 'Qtd', 'Preço unit.', 'Subtotal', 'Lucro'];
  const vdLinhas = [vdHead, ...itens.filter(i => ['atelie', 'online', 'outro'].includes(i.v.canal)).map(i =>
    [dataBR(i.v.data), canalNome[i.v.canal], pagNome[i.v.forma_pagamento] || i.v.forma_pagamento || '', prod(i.produto_id)?.nome || '(excluído)', i.quantidade, r2(i.preco_unit), r2(i.quantidade * i.preco_unit), r2(lucroItem(i))])];
  XLSX.utils.book_append_sheet(wb, aba(XLSX, vdLinhas, { dinheiro: [5, 6, 7] }), 'Direta e online');

  // ---------- Box ----------
  if (B) {
    const limite = confNum('encalhado_dias', 30);
    const ult = {}, prim = {};
    movs.forEach(m => {
      if (m.origem_id === B.id && m.tipo === 'venda') ult[m.produto_id] = m.criado_em;
      if (m.destino_id === B.id && !prim[m.produto_id]) prim[m.produto_id] = m.criado_em;
    });
    const it30 = itens.filter(i => i.v.local_id === B.id && (hoje - new Date(i.v.data)) / 864e5 <= 30);
    const itBox = itens.filter(i => i.v.local_id === B.id);
    const ids = new Set([...itBox.map(i => i.produto_id), ...S.estoque.filter(e => e.local_id === B.id && e.quantidade > 0).map(e => e.produto_id)]);
    const boxLinhas = [['Produto', 'No Box agora', 'Vendidos (total)', 'Vendidos (30 dias)', 'Faturamento no Box', 'Giro', 'Última venda', 'Dias sem vender', 'Situação'],
      ...[...ids].map(id => {
        const p = prod(id); const q = itBox.filter(i => i.produto_id === id).reduce((s, i) => s + i.quantidade, 0);
        const q30 = it30.filter(i => i.produto_id === id).reduce((s, i) => s + i.quantidade, 0);
        const fat = itBox.filter(i => i.produto_id === id).reduce((s, i) => s + i.quantidade * i.preco_unit, 0);
        const noBox = est(id, B.id); const ref = ult[id] || prim[id];
        const dias = ref ? Math.floor((hoje - new Date(ref)) / 864e5) : '';
        const sit = noBox <= 0 ? 'acabou no Box' : (dias !== '' && dias >= limite) ? 'encalhado' : q30 > 0 ? 'vendendo' : '—';
        return [p?.nome || '(excluído)', noBox, q, q30, r2(fat), (q + noBox) ? q / (q + noBox) : 0, ult[id] ? dataBR(ult[id]) : 'nunca', dias, sit];
      }).sort((a, b) => b[2] - a[2])];
    XLSX.utils.book_append_sheet(wb, aba(XLSX, boxLinhas, { dinheiro: [4], pct: [5] }), 'Box');
  }

  // ---------- Eventos ----------
  const evLinhas = [['Evento', 'Lugar', 'Início', 'Fim', 'Situação', 'Nº vendas', 'Unidades', 'Faturamento', 'Custo dos produtos', 'Custo da mesa', 'Lucro', 'Ticket médio', 'Mais vendido'],
    ...eventos.map(e => {
      const vs = vendas.filter(v => v.evento_id === e.id); const its = vs.flatMap(v => v.venda_itens);
      const fat = somaFat(vs); const custo = its.reduce((s, i) => s + i.quantidade * i.custo_unit, 0);
      const pp = {}; its.forEach(i => pp[i.produto_id] = (pp[i.produto_id] || 0) + i.quantidade);
      const top = Object.entries(pp).sort((a, b) => b[1] - a[1])[0];
      return [e.nome, e.lugar || '', e.data_inicio ? dataBR(e.data_inicio + 'T12:00') : '', e.data_fim ? dataBR(e.data_fim + 'T12:00') : '',
        { planejado: 'Planejado', aberto: 'Acontecendo', fechado: 'Fechado' }[e.status], vs.length, its.reduce((s, i) => s + i.quantidade, 0),
        r2(fat), r2(custo), r2(e.custo_mesa), r2(fat - custo - Number(e.custo_mesa || 0)), vs.length ? r2(fat / vs.length) : 0, top ? `${prod(top[0])?.nome || ''} (${top[1]})` : ''];
    })];
  XLSX.utils.book_append_sheet(wb, aba(XLSX, evLinhas, { dinheiro: [7, 8, 9, 10, 11] }), 'Eventos');

  // ---------- Todas as vendas (item a item) ----------
  const tvLinhas = [['Data', 'Hora', 'Local', 'Canal', 'Evento', 'Pagamento', 'Produto', 'Categoria', 'Qtd', 'Preço unit.', 'Subtotal', 'Custo unit.', 'Lucro', 'Desconto da venda', 'Total da venda', 'Origem'],
    ...itens.slice().reverse().map(i => {
      const p = prod(i.produto_id); const d = new Date(i.v.data);
      return [d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), loc(i.v.local_id)?.nome || '', canalNome[i.v.canal] || i.v.canal,
        eventos.find(e => e.id === i.v.evento_id)?.nome || '', pagNome[i.v.forma_pagamento] || i.v.forma_pagamento || '', p?.nome || '(excluído)', cat(p?.categoria_id)?.nome || '',
        i.quantidade, r2(i.preco_unit), r2(i.quantidade * i.preco_unit), r2(i.custo_unit), r2(lucroItem(i)), r2(i.v.desconto), r2(i.v.total), { caixa: 'Caixa', contagem: 'Contagem do Box', manual: 'Manual' }[i.v.origem] || ''];
    })];
  XLSX.utils.book_append_sheet(wb, aba(XLSX, tvLinhas, { dinheiro: [9, 10, 11, 12, 13, 14] }), 'Todas as vendas');

  XLSX.writeFile(wb, `relatorio-yume-${hoje.toISOString().slice(0, 10)}.xlsx`);
}
