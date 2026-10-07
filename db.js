// Camada de dados (Supabase)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
export const configurado = /^https:\/\//.test(cfg.SUPABASE_URL || '') && (cfg.SUPABASE_ANON_KEY || '').length > 20;
export const sb = configurado ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

export const S = { categorias: [], colecoes: [], locais: [], produtos: [], estoque: [], eventos: [], config: {} };

export async function q(p) {
  const { data, error } = await p;
  if (error) { console.error(error); throw new Error(error.message || 'Erro no banco de dados'); }
  return data;
}

// Busca todas as linhas (o Supabase devolve no máximo 1000 por vez)
export async function todos(build) {
  const out = []; const passo = 1000;
  for (let i = 0; ; i += passo) {
    const lote = await q(build().range(i, i + passo - 1));
    out.push(...lote);
    if (lote.length < passo) break;
  }
  return out;
}

export async function carregarTudo() {
  const [categorias, colecoes, locais, produtos, estoque, eventos, conf] = await Promise.all([
    q(sb.from('categorias').select('*').order('nome')),
    q(sb.from('colecoes').select('*').order('nome')),
    q(sb.from('locais').select('*').order('criado_em')),
    todos(() => sb.from('produtos').select('*').order('nome')),
    todos(() => sb.from('estoque_atual').select('*')),
    q(sb.from('eventos').select('*').order('data_inicio', { ascending: false, nullsFirst: false })),
    q(sb.from('configuracoes').select('*')),
  ]);
  Object.assign(S, { categorias, colecoes, locais, produtos, estoque, eventos });
  S.config = Object.fromEntries(conf.map(c => [c.chave, c.valor]));
}
export async function recarregarEstoque() {
  S.estoque = await todos(() => sb.from('estoque_atual').select('*'));
}
export async function recarregarProdutos() {
  S.produtos = await todos(() => sb.from('produtos').select('*').order('nome'));
}

// ---------- Consultas em memória ----------
export const cat = id => S.categorias.find(c => c.id === id);
export const col = id => S.colecoes.find(c => c.id === id);
export const loc = id => S.locais.find(l => l.id === id);
export const prod = id => S.produtos.find(p => p.id === id);
export const atelie = () => S.locais.find(l => l.tipo === 'atelie' && l.ativo !== false) || S.locais.find(l => l.tipo === 'atelie');
export const box = () => S.locais.find(l => l.tipo === 'box' && l.ativo !== false) || S.locais.find(l => l.tipo === 'box');
export const locaisFixos = () => S.locais.filter(l => l.tipo !== 'evento' && l.ativo !== false);
export const localDoEvento = evId => S.locais.find(l => l.evento_id === evId);

export function est(produtoId, localId) {
  const r = S.estoque.find(e => e.produto_id === produtoId && e.local_id === localId);
  return r ? r.quantidade : 0;
}
export function estTotal(produtoId) {
  return S.estoque.filter(e => e.produto_id === produtoId).reduce((s, e) => s + e.quantidade, 0);
}
export function estPorLocal(produtoId) {
  return S.estoque.filter(e => e.produto_id === produtoId && e.quantidade !== 0)
    .map(e => ({ local: loc(e.local_id), quantidade: e.quantidade }))
    .filter(x => x.local);
}
// Produto com estoque baixo em algum local fixo (ou no total)
export function estoqueBaixo(p) {
  if (!p.ativo || !p.estoque_minimo) return false;
  return estTotal(p.id) <= p.estoque_minimo;
}
export function produtosNoLocal(localId) {
  return S.estoque.filter(e => e.local_id === localId && e.quantidade > 0).map(e => ({ p: prod(e.produto_id), q: e.quantidade })).filter(x => x.p);
}

// ---------- Vendas ----------
export async function vendasPeriodo(ini, fim, extra = (b) => b) {
  return todos(() => extra(sb.from('vendas').select('*, venda_itens(*)')
    .gte('data', ini.toISOString()).lt('data', fim.toISOString())
    .order('data', { ascending: false })));
}
export const canalNome = { atelie: 'Venda direta', box: 'Box', evento: 'Evento', online: 'Loja online', outro: 'Outro' };
export const pagNome = { pix: 'Pix', dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', outro: 'Outro' };
export function canalDoLocal(l) {
  if (!l) return 'atelie';
  return l.tipo === 'box' ? 'box' : l.tipo === 'evento' ? 'evento' : l.tipo === 'atelie' ? 'atelie' : 'outro';
}

export async function salvarConfig(chave, valor) {
  await q(sb.from('configuracoes').upsert({ chave, valor }));
  S.config[chave] = valor;
}
export const confNum = (k, def = 0) => { const v = S.config[k]; const n = Number(v); return isNaN(n) ? def : n; };

export async function uploadFoto(blob) {
  const nome = `${crypto.randomUUID()}.jpg`;
  await q(sb.storage.from('produtos').upload(nome, blob, { contentType: 'image/jpeg', upsert: false }));
  return sb.storage.from('produtos').getPublicUrl(nome).data.publicUrl;
}
