// Utilitários de interface: ícones, formatação, modal, toast
const P = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  receipt: '<path d="M5 2h14v20l-2.5-1.5L14 22l-2-1.5-2 1.5-2.5-1.5L5 22z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  swap: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 1.9-1.6L22 7H5.1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  backup: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
};
export const ic = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (v) => brl.format(Number(v) || 0);
export const num = (v) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
export const pct = (v) => `${(Number(v) * 100 || 0).toFixed(0)}%`;
export const dataBR = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '';
export const dataHoraBR = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export const diaISO = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const parseNum = (s) => { if (typeof s === 'number') return s; const t = String(s || '').trim().replace(/\s|R\$/g, ''); if (!t) return 0; const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return Number(n) || 0; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, erro = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (erro ? ' erro' : '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), erro ? 4500 : 2600);
}

export function modal(html, { onMount, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  let fechado = false;
  const close = () => { if (fechado) return; fechado = true; bg.remove(); if (!document.querySelector('.modal-bg')) document.body.style.overflow = ''; onClose && onClose(); };
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  const onKey = e => { if (e.key === 'Escape' && document.body.contains(bg)) { close(); } if (!document.body.contains(bg)) document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  bg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  onMount && onMount(bg.querySelector('.modal'), close);
  return close;
}

export function confirmar(texto, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise(res => {
    let resp = false;
    modal(`
      <div class="mh"><h2>Tem certeza?</h2></div>
      <p>${texto}</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn sec" data-r="0">Cancelar</button>
        <button class="btn ${perigo ? 'perigo' : ''}" data-r="1">${esc(ok)}</button>
      </div>`, {
      onMount: (m, c) => m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { resp = b.dataset.r === '1'; c(); }),
      onClose: () => res(resp)
    });
  });
}

export function vazio(texto, icone = 'leaf', acao = '') {
  return `<div class="vazio">${ic(icone)}<div>${texto}</div>${acao ? `<div style="margin-top:14px">${acao}</div>` : ''}</div>`;
}

export const loading = () => `<div class="loading"><div class="spin"></div></div>`;

export function fotoHTML(url, cls = 'foto') {
  return `<div class="${cls}">${url ? `<img loading="lazy" src="${esc(url)}" alt="">` : ic('image')}</div>`;
}

export function qtyHTML(name, val = 0, min = 0, max = '') {
  return `<span class="qty" data-qty><button type="button" data-d="-1">−</button><input type="number" inputmode="numeric" name="${esc(name)}" value="${val}" min="${min}" ${max !== '' ? `max="${max}"` : ''}><button type="button" data-d="1">+</button></span>`;
}
export function bindQty(root, onChange) {
  root.querySelectorAll('[data-qty]').forEach(q => {
    const inp = q.querySelector('input');
    q.querySelectorAll('button').forEach(b => b.onclick = () => {
      const min = inp.min === '' ? -Infinity : Number(inp.min);
      const max = inp.max === '' ? Infinity : Number(inp.max);
      inp.value = Math.min(max, Math.max(min, (Number(inp.value) || 0) + Number(b.dataset.d)));
      onChange && onChange(inp);
    });
    inp.oninput = () => onChange && onChange(inp);
  });
}

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([tipo.startsWith('text/csv') ? '﻿' + conteudo : conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function csv(linhas) {
  return linhas.map(l => l.map(c => {
    const s = String(c ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\n');
}

// Redimensiona imagem antes do upload (economiza espaço no plano grátis)
export async function redimensionar(file, max = 900) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const esc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}

// Gráfico de barras empilhadas simples em SVG
export function barrasEmpilhadas(labels, series, { altura = 200 } = {}) {
  const W = 600, H = altura, padL = 46, padB = 26, padT = 10;
  const totais = labels.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
  const maxV = Math.max(1, ...totais);
  const passo = niceStep(maxV);
  const topo = Math.ceil(maxV / passo) * passo;
  const bw = (W - padL) / labels.length;
  const y = v => H - padB - (v / topo) * (H - padB - padT);
  let g = '';
  for (let v = 0; v <= topo; v += passo) {
    g += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#3F45311F"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#3F4531" opacity=".7">${abrev(v)}</text>`;
  }
  labels.forEach((l, i) => {
    let base = 0;
    const x = padL + i * bw + bw * 0.2, w = bw * 0.6;
    series.forEach(se => {
      const v = se.valores[i] || 0;
      if (v > 0) {
        g += `<rect x="${x}" y="${y(base + v)}" width="${w}" height="${y(base) - y(base + v)}" fill="${se.cor}" stroke="#3F453155" stroke-width="1" rx="3"><title>${esc(se.nome)}: ${money(v)}</title></rect>`;
      }
      base += v;
    });
    g += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#3F4531" font-weight="700">${esc(l)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>
    <div class="legend">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div></div>`;
}
function niceStep(max) {
  const raw = max / 4; const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function abrev(v) { return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + 'k' : String(v); }
