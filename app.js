import { sb, configurado, carregarTudo, S } from './db.js';
import { ic, esc, toast, loading } from './ui.js';
import * as inicio from './pg-inicio.js';
import * as produtos from './pg-produtos.js';
import * as movimentar from './pg-movimentar.js';
import * as vendas from './pg-vendas.js';
import * as caixa from './pg-caixa.js';
import * as boxPg from './pg-box.js';
import * as eventos from './pg-eventos.js';
import * as configPg from './pg-config.js';
import { iniciarPush } from './push.js';

const BRAND = (window.APP_CONFIG || {}).BRAND || 'Yume';
document.title = `${BRAND} · Estoque`;
const app = document.getElementById('app');

const rotas = [
  [/^\/?$/, inicio.render, 'inicio'],
  [/^\/produtos$/, produtos.renderLista, 'produtos'],
  [/^\/produto\/([\w-]+)$/, produtos.renderDetalhe, 'produtos'],
  [/^\/movimentar$/, movimentar.render, 'produtos'],
  [/^\/vendas$/, vendas.render, 'vendas'],
  [/^\/caixa\/([\w-]+)$/, caixa.render, 'vendas'],
  [/^\/box$/, boxPg.render, 'box'],
  [/^\/box\/contagem$/, boxPg.renderContagem, 'box'],
  [/^\/eventos$/, eventos.renderLista, 'eventos'],
  [/^\/evento\/([\w-]+)$/, eventos.renderDetalhe, 'eventos'],
  [/^\/config$/, configPg.render, 'config'],
];

const nav = [
  ['inicio', '#/', 'home', 'Início'],
  ['produtos', '#/produtos', 'package', 'Produtos'],
  ['vendas', '#/vendas', 'receipt', 'Vendas'],
  ['box', '#/box', 'store', 'Box'],
  ['eventos', '#/eventos', 'calendar', 'Eventos'],
];

function logoHTML() {
  return `<span class="brand">${ic('leaf')}${esc(BRAND)}</span>`;
}

function shell() {
  app.innerHTML = `
    <header class="top">
      <a href="#/" style="text-decoration:none;display:flex;align-items:center">${logoHTML()}</a>
      <div class="spacer"></div>
      <a class="btn ghost icon-only" href="#/movimentar" title="Movimentar estoque">${ic('swap')}</a>
      <a class="btn ghost icon-only" href="#/config" title="Configurações">${ic('sliders')}</a>
    </header>
    <nav class="bottom">${nav.map(([k, h, i, t]) => `<a href="${h}" data-k="${k}"><span class="pill">${ic(i)}</span>${t}</a>`).join('')}
      <a href="#/config" data-k="config" class="so-desktop" style="display:none"><span class="pill">${ic('sliders')}</span>Configurações</a>
    </nav>
    <main id="view"></main>`;
  if (matchMedia('(min-width:900px)').matches) app.querySelector('.so-desktop').style.display = '';
}

let seq = 0;
async function rotear() {
  const view = document.getElementById('view');
  if (!view) return;
  const path = location.hash.replace(/^#/, '') || '/';
  const meu = ++seq;
  for (const [re, fn, k] of rotas) {
    const m = path.match(re);
    if (m) {
      document.querySelectorAll('nav.bottom a').forEach(a => a.classList.toggle('ativo', a.dataset.k === k));
      document.querySelectorAll('.cart-bar,.fab,.modal-bg').forEach(e => e.remove());
      document.body.style.overflow = '';
      view.innerHTML = loading();
      window.scrollTo(0, 0);
      try {
        await fn(view, m[1], () => meu === seq);
      } catch (e) {
        console.error(e);
        if (meu === seq) view.innerHTML = `<div class="card"><h2>Ops!</h2><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
      }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', rotear);
window.rotear = rotear;

function telaLogin() {
  app.innerHTML = `
    <div class="login-wrap"><div class="login card">
      <div class="brand-big">${ic('leaf')}${esc(BRAND)}</div>
      <h1 style="margin-bottom:4px">Estoque e vendas</h1>
      <p class="muted" style="margin-top:0">Entre para continuar 🌿</p>
      <form id="flogin" style="text-align:left">
        <div class="field"><label class="f">E-mail</label><input class="in" type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label class="f">Senha</label><input class="in" type="password" name="senha" autocomplete="current-password" required></div>
        <button class="btn full" type="submit">Entrar</button>
      </form>
    </div></div>`;
  document.getElementById('flogin').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Entrando...';
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('senha') });
    if (error) { toast('E-mail ou senha incorretos', true); b.disabled = false; b.textContent = 'Entrar'; }
  };
}

function telaNaoConfigurado() {
  app.innerHTML = `<div class="login-wrap"><div class="login card">
    <h1>Quase lá! 🌿</h1>
    <p>Falta colar a <b>Project URL</b> e a <b>anon key</b> do Supabase no arquivo <code>config.js</code>.</p></div></div>`;
}

let iniciado = false;
async function iniciar() {
  if (iniciado) return; iniciado = true;
  shell();
  document.getElementById('view').innerHTML = loading();
  try { await carregarTudo(); }
  catch (e) {
    document.getElementById('view').innerHTML = `<div class="card"><h2>Não consegui carregar os dados</h2><p>${esc(e.message)}</p><p class="small muted">Se o banco foi pausado por falta de uso, entre no painel do Supabase e clique em "Restore project".</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    return;
  }
  rotear();
  iniciarPush();
}

(async function boot() {
  if (!configurado) return telaNaoConfigurado();
  const { data } = await sb.auth.getSession();
  if (data.session) iniciar(); else telaLogin();
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && session) iniciar();
    if (ev === 'SIGNED_OUT') { iniciado = false; telaLogin(); }
  });
})();

// Registra o sw.js (o mesmo que o OneSignal usa para as notificações)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
